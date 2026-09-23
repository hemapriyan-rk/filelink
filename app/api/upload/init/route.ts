import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { datePathPrefix, generatePublicToken, generateStorageKey, hashToken } from "@/lib/token";
import { sanitizeFilename, sanitizeMimeType } from "@/lib/sanitize";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBan, recordStrike } from "@/lib/abuse";
import { verifyTotp } from "@/lib/totp";
import { getCapacity } from "@/lib/capacity";
import { serverEnv } from "@/lib/env";
import {
  ADMIN_UPLOAD_SAFETY_MARGIN_BYTES,
  MAX_DOWNLOADS_LIMIT,
  MAX_EXPIRATION_MINUTES,
  MAX_EXPIRATION_MINUTES_ADMIN,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES_ADMIN,
  MIN_DOWNLOADS_LIMIT,
  MIN_EXPIRATION_MINUTES,
  NEAR_FULL_EXPIRATION_MINUTES,
  STORAGE_BUCKET,
} from "@/lib/constants";

const ABUSE_WARNING = " Repeated attempts to bypass this limit will result in a temporary ban.";
const NEAR_FULL_MESSAGE =
  "We're low on storage space right now, so only the 10-minute expiration is available until " +
  "some room frees up. Please try a longer duration again in a little while.";

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

  const capacity = await getCapacity();
  if (capacity.status === "full") {
    return NextResponse.json(
      {
        error:
          "Crate Link is out of storage space right now. Files expire and get cleaned up over " +
          "time, freeing up room — please wait a while and try again.",
        capacity: capacity.status,
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { filename, mimeType, sizeBytes, expiresMinutes, maxDownloads, adminCode, groupToken } = (body ??
    {}) as Record<string, unknown>;

  // A "crate": several files uploaded under one shared token instead of
  // each getting its own (see /api/upload/group-token and
  // ARCHITECTURE.md §22). Format-validated against exactly what
  // generatePublicToken() produces — 32 random bytes, base64url-encoded —
  // so this can't be used to force an arbitrary attacker-chosen
  // token_hash into the table.
  let groupTokenHash: string | null = null;
  if (typeof groupToken === "string") {
    if (!/^[A-Za-z0-9_-]{43}$/.test(groupToken)) {
      return NextResponse.json({ error: "Invalid group token." }, { status: 400 });
    }
    groupTokenHash = hashToken(groupToken);
  }

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

  // Even an admin code can't outrun actual available space — it raises
  // the ceiling up to what's really left, minus a safety margin, never
  // past it.
  const remainingBytes = Math.max(0, capacity.quotaBytes - capacity.usedBytes);
  const maxFileSize = isAdmin
    ? Math.max(0, Math.min(MAX_FILE_SIZE_BYTES_ADMIN, remainingBytes - ADMIN_UPLOAD_SAFETY_MARGIN_BYTES))
    : MAX_FILE_SIZE_BYTES;
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
        error: isAdmin
          ? `Not enough storage space left for a file this size (${Math.floor(maxFileSize / (1024 * 1024))} MB available).`
          : `File exceeds the ${Math.floor(maxFileSize / (1024 * 1024))} MB limit.${ABUSE_WARNING}`,
      },
      { status: 413 }
    );
  }

  // Near-full: standard uploads are held to the shortest expiration so
  // whatever's stored turns over faster. This is enforced here, not just
  // hidden in the UI, since the UI's restriction alone is only advisory.
  if (!isAdmin && capacity.status === "near_full" && expiresMinutes !== NEAR_FULL_EXPIRATION_MINUTES) {
    return NextResponse.json({ error: NEAR_FULL_MESSAGE, capacity: capacity.status }, { status: 409 });
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
      !Number.isFinite(maxDownloads) ||
      !Number.isInteger(maxDownloads) ||
      maxDownloads < MIN_DOWNLOADS_LIMIT ||
      maxDownloads > MAX_DOWNLOADS_LIMIT
    ) {
      return NextResponse.json(
        {
          error: `Download limit must be between ${MIN_DOWNLOADS_LIMIT} and ${MAX_DOWNLOADS_LIMIT}.`,
        },
        { status: 400 }
      );
    }
    normalizedMaxDownloads = maxDownloads;
  }

  const safeFilename = sanitizeFilename(typeof filename === "string" ? filename : "");
  const safeMimeType = sanitizeMimeType(typeof mimeType === "string" ? mimeType : "");

  const storageKey = generateStorageKey();
  const storagePath = `temp/${datePathPrefix()}/${storageKey}`;
  const publicToken = groupTokenHash ? (groupToken as string) : generatePublicToken();
  const tokenHash = groupTokenHash ?? hashToken(publicToken);

  const admin = getSupabaseAdmin();

  // expires_at is deliberately NOT set here — the clock shouldn't start
  // until the file has actually finished uploading (see
  // app/api/upload/confirm/route.ts). expiresMinutes is already fully
  // validated above, so it's safe to persist and trust again at confirm
  // time without re-validating.
  const { data: row, error: insertError } = await admin
    .from("files")
    .insert({
      token_hash: tokenHash,
      storage_path: storagePath,
      original_filename: safeFilename,
      mime_type: safeMimeType,
      size_bytes: sizeBytes,
      expiration_minutes: expiresMinutes,
      max_downloads: normalizedMaxDownloads,
      status: "pending",
      is_admin_upload: isAdmin,
      uploader_ip: ip,
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
    isAdmin,
  });
}
