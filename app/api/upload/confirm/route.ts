import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { objectExists } from "@/lib/queries";
import { EXPIRATION_START_BUFFER_SECONDS } from "@/lib/constants";

/**
 * Called by the client after it has finished PUTting the file bytes
 * directly to Supabase Storage using the signed upload URL from
 * /api/upload/init. We independently verify the object actually landed in
 * storage before flipping the row to "active" — this prevents an
 * interrupted/failed upload from ever producing a shareable link that 404s
 * on download.
 *
 * expires_at is computed HERE, not at /api/upload/init, precisely because
 * this is the moment the file is actually usable — computing it at init
 * would start the clock before a single byte was uploaded, silently
 * eating into the expiration window of anything large/slow enough to take
 * a while to transfer. EXPIRATION_START_BUFFER_SECONDS adds a little more
 * room on top for the confirm round trip and QR render.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { uploadId } = (body ?? {}) as Record<string, unknown>;
  if (typeof uploadId !== "string" || uploadId.length === 0) {
    return NextResponse.json({ error: "Invalid upload id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin
    .from("files")
    .select("id, storage_path, status, expiration_minutes")
    .eq("id", uploadId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    console.error("upload/confirm lookup failed", error);
    return NextResponse.json({ error: "Could not confirm upload." }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Upload not found or already confirmed." }, { status: 404 });
  }

  const exists = await objectExists(row.storage_path);
  if (!exists) {
    return NextResponse.json(
      { error: "Upload did not complete. Please try again." },
      { status: 409 }
    );
  }

  const expiresAt = new Date(
    Date.now() + (row.expiration_minutes ?? 0) * 60 * 1000 + EXPIRATION_START_BUFFER_SECONDS * 1000
  ).toISOString();

  const { error: updateError } = await admin
    .from("files")
    .update({ status: "active", expires_at: expiresAt })
    .eq("id", row.id)
    .eq("status", "pending");

  if (updateError) {
    console.error("upload/confirm update failed", updateError);
    return NextResponse.json({ error: "Could not confirm upload." }, { status: 500 });
  }

  return NextResponse.json({ success: true, expiresAt });
}
