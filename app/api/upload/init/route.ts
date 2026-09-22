import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generatePublicToken, generateStorageKey, hashToken } from "@/lib/token";
import { sanitizeFilename, sanitizeMimeType } from "@/lib/sanitize";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBan, recordStrike } from "@/lib/abuse";
import { verifyTotp } from "@/lib/totp";
import { serverEnv } from "@/lib/env";
import {
  ALLOWED_MAX_DOWNLOADS,
  MAX_EXPIRATION_MINUTES,
  MAX_EXPIRATION_MINUTES_ADMIN,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES_ADMIN,
  MIN_EXPIRATION_MINUTES,
  STORAGE_BUCKET,
} from "@/lib/constants";

const ABUSE_WARNING = " Repeated attempts to bypass this limit will result in a temporary ban.";

function bannedResponse(bannedUntil: string | null) {
  return NextResponse.json(
    {
      error: "This IP has been temporarily banned for repeated abuse.",
      bannedUntil,
    },
    { status: 403 }
  );
}

export async function POST(req: NextRequest) {
  const ip = clientIpFrom(req.headers);

  const ban = await checkBan(ip);
  if (ban.banned) {
    return bannedResponse(ban.bannedUntil);
  }

  const rate = checkRateLimit(`upload-init:${ip}`, 60, 10 * 60 * 1000);
  if (!rate.allowed) {
    const strike = await recordStrike(ip);
    if (strike.banned) return bannedResponse(strike.bannedUntil);
    return NextResponse.json(
      { error: "Too many uploads. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { filename, mimeType, sizeBytes, expiresMinutes, maxDownloads, adminCode } = (body ??
    {}) as Record<string, unknown>;

  // An admin code only ever RAISES the ceiling — never lowers requirements,
  // never grants anything beyond bigger size/longer expiration. If it's
  // wrong, that's a strike (brute-force attempts against a 6-digit rotating
  // code are exactly the kind of thing this system exists to deter); if
  // it's simply absent, that's just a normal request at standard limits.
  let isAdmin = false;
  if (typeof adminCode === "string" && adminCode.trim().length > 0) {
    const secret = serverEnv.adminTotpSecret;
    isAdmin = !!secret && verifyTotp(secret, adminCode);
    if (!isAdmin) {
      const strike = await recordStrike(ip);
      if (strike.banned) return bannedResponse(strike.bannedUntil);
      return NextResponse.json({ error: "Invalid admin code." }, { status: 403 });
    }
  }

  const maxFileSize = isAdmin ? MAX_FILE_SIZE_BYTES_ADMIN : MAX_FILE_SIZE_BYTES;
  const maxExpiration = isAdmin ? MAX_EXPIRATION_MINUTES_ADMIN : MAX_EXPIRATION_MINUTES;

  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
  }
  if (sizeBytes > maxFileSize) {
    if (!isAdmin) {
      const strike = await recordStrike(ip);
      if (strike.banned) return bannedResponse(strike.bannedUntil);
    }
    return NextResponse.json(
      {
        error:
          `File exceeds the ${Math.floor(maxFileSize / (1024 * 1024))} MB limit.` +
          (isAdmin ? "" : ABUSE_WARNING),
      },
      { status: 413 }
    );
  }

  if (
    typeof expiresMinutes !== "number" ||
    !Number.isFinite(expiresMinutes) ||
    !Number.isInteger(expiresMinutes) ||
    expiresMinutes < MIN_EXPIRATION_MINUTES ||
    expiresMinutes > maxExpiration
  ) {
    if (!isAdmin && typeof expiresMinutes === "number" && expiresMinutes > MAX_EXPIRATION_MINUTES) {
      const strike = await recordStrike(ip);
      if (strike.banned) return bannedResponse(strike.bannedUntil);
    }
    return NextResponse.json(
      {
        error:
          `Expiration must be between ${MIN_EXPIRATION_MINUTES} minute and ${Math.floor(
            maxExpiration / (24 * 60)
          )} days.` + (isAdmin ? "" : ABUSE_WARNING),
      },
      { status: 400 }
    );
  }

  let normalizedMaxDownloads: number | null = null;
  if (maxDownloads !== null && maxDownloads !== undefined) {
    if (
      typeof maxDownloads !== "number" ||
      !ALLOWED_MAX_DOWNLOADS.includes(maxDownloads as (typeof ALLOWED_MAX_DOWNLOADS)[number])
    ) {
      return NextResponse.json({ error: "Invalid download limit." }, { status: 400 });
    }
    normalizedMaxDownloads = maxDownloads;
  }

  const safeFilename = sanitizeFilename(typeof filename === "string" ? filename : "");
  const safeMimeType = sanitizeMimeType(typeof mimeType === "string" ? mimeType : "");

  const storageKey = generateStorageKey();
  const storagePath = `temp/${storageKey}`;
  const publicToken = generatePublicToken();
  const tokenHash = hashToken(publicToken);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();

  const admin = getSupabaseAdmin();

  const { data: row, error: insertError } = await admin
    .from("files")
    .insert({
      token_hash: tokenHash,
      storage_path: storagePath,
      original_filename: safeFilename,
      mime_type: safeMimeType,
      size_bytes: sizeBytes,
      expires_at: expiresAt,
      max_downloads: normalizedMaxDownloads,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !row) {
    console.error("upload/init insert failed", insertError);
    return NextResponse.json({ error: "Could not start upload." }, { status: 500 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signError || !signed) {
    console.error("upload/init sign failed", signError);
    await admin.from("files").delete().eq("id", row.id);
    return NextResponse.json({ error: "Could not start upload." }, { status: 500 });
  }

  return NextResponse.json({
    uploadId: row.id,
    signedUrl: signed.signedUrl,
    signedToken: signed.token,
    storagePath,
    publicToken,
    shareUrl: `${serverEnv.siteUrl}/f/${publicToken}`,
  });
}
