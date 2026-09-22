import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generatePublicToken, generateStorageKey, hashToken } from "@/lib/token";
import { sanitizeFilename, sanitizeMimeType } from "@/lib/sanitize";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { serverEnv } from "@/lib/env";
import {
  ALLOWED_EXPIRATIONS_MINUTES,
  ALLOWED_MAX_DOWNLOADS,
  MAX_FILE_SIZE_BYTES,
  STORAGE_BUCKET,
} from "@/lib/constants";

export async function POST(req: NextRequest) {
  const ip = clientIpFrom(req.headers);
  const rate = checkRateLimit(`upload-init:${ip}`, 20, 10 * 60 * 1000);
  if (!rate.allowed) {
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

  const { filename, mimeType, sizeBytes, expiresMinutes, maxDownloads } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit.` },
      { status: 413 }
    );
  }
  if (
    typeof expiresMinutes !== "number" ||
    !ALLOWED_EXPIRATIONS_MINUTES.includes(expiresMinutes as (typeof ALLOWED_EXPIRATIONS_MINUTES)[number])
  ) {
    return NextResponse.json({ error: "Invalid expiration." }, { status: 400 });
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
