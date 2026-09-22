import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashToken } from "@/lib/token";
import { consumeDownload } from "@/lib/queries";
import { STORAGE_BUCKET, SIGNED_DOWNLOAD_URL_TTL_SECONDS } from "@/lib/constants";

/**
 * The only route that actually authorizes a download. It:
 *   1. Atomically validates the token and consumes one download slot
 *      (consume_download — see the race-condition note in lib/queries.ts).
 *   2. Only after that succeeds, mints a short-lived signed URL for the
 *      real storage object and redirects the client to it.
 *
 * The signed URL is generated fresh per request and expires in
 * SIGNED_DOWNLOAD_URL_TTL_SECONDS — it is never stored or reused.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length > 200) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  const tokenHash = hashToken(token);

  let consumed;
  try {
    consumed = await consumeDownload(tokenHash);
  } catch (err) {
    console.error("download consume failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  if (!consumed) {
    return NextResponse.json({ error: "This link is no longer available." }, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const { data: signed, error: signError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(consumed.storage_path, SIGNED_DOWNLOAD_URL_TTL_SECONDS, {
      download: consumed.original_filename,
    });

  if (signError || !signed) {
    console.error("download sign failed", signError);
    return NextResponse.json({ error: "This link is no longer available." }, { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
