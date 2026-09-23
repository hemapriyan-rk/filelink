import { NextRequest, NextResponse } from "next/server";
import { generatePublicToken } from "@/lib/token";
import { checkBan, recordStrike } from "@/lib/abuse";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { verifyTotp } from "@/lib/totp";
import { serverEnv } from "@/lib/env";
import { GROUP_TOKEN_RATE_LIMIT, GROUP_TOKEN_RATE_WINDOW_MS } from "@/lib/constants";

/**
 * Mints a single share token for a "crate" — several files uploaded
 * together under one link/QR that the recipient browses and downloads
 * individually from (see app/f/[token]/page.tsx). This doesn't create
 * any `files` row itself; the client calls /api/upload/init once per
 * file afterward, passing this token back as `groupToken` so each row is
 * inserted with the same token_hash. Rate-limited the same as starting
 * an upload, since minting a token is the first step of one — except for
 * a valid admin code, which bypasses it the same way /api/upload/init
 * does, so starting a crate never gets the operator blocked before they
 * even reach the per-file admin check.
 */
export async function POST(req: NextRequest) {
  const ip = clientIpFrom(req.headers);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { adminCode } = (body ?? {}) as Record<string, unknown>;

  let isAdmin = false;
  if (typeof adminCode === "string" && adminCode.trim().length > 0) {
    const secret = serverEnv.adminTotpSecret;
    isAdmin = !!secret && verifyTotp(secret, adminCode);
    if (!isAdmin) {
      const strike = await recordStrike(ip);
      if (strike.banned) {
        return NextResponse.json(
          { error: "This IP has been temporarily banned for repeated abuse.", bannedUntil: strike.bannedUntil },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: "Invalid admin code." }, { status: 403 });
    }
  }

  if (!isAdmin) {
    const ban = await checkBan(ip);
    if (ban.banned) {
      return NextResponse.json(
        { error: "This IP has been temporarily banned for repeated abuse.", bannedUntil: ban.bannedUntil },
        { status: 403 }
      );
    }

    const rate = checkRateLimit(`group-token:${ip}`, GROUP_TOKEN_RATE_LIMIT, GROUP_TOKEN_RATE_WINDOW_MS);
    if (!rate.allowed) {
      const strike = await recordStrike(ip);
      if (strike.banned) {
        return NextResponse.json(
          { error: "This IP has been temporarily banned for repeated abuse.", bannedUntil: strike.bannedUntil },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "Too many uploads. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }
  }

  const publicToken = generatePublicToken();
  return NextResponse.json({
    groupToken: publicToken,
    shareUrl: `${serverEnv.siteUrl}/f/${publicToken}`,
  });
}
