import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashToken } from "@/lib/token";
import { consumeDownloadById, lookupActiveFiles } from "@/lib/queries";
import { STORAGE_BUCKET, SIGNED_DOWNLOAD_URL_TTL_SECONDS } from "@/lib/constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The only route that actually authorizes a download. It:
 *   1. Atomically validates the token (and, for a crate, which specific
 *      file within it) and consumes one download slot
 *      (consume_download_by_id — see the race-condition note in
 *      lib/queries.ts).
 *   2. Only after that succeeds, mints a short-lived signed URL for the
 *      real storage object and redirects the client to it.
 *
 * `?file=<id>` names which file to download when a token maps to more
 * than one (a crate — ARCHITECTURE.md §22); the /f/[token] page always
 * includes it when linking here. It's optional for backward
 * compatibility with the plain single-file case: if omitted, this falls
 * back to "the one active file this token matches" and 404s if that's
 * not exactly one row, rather than guessing.
 *
 * The signed URL is generated fresh per request and expires in
 * SIGNED_DOWNLOAD_URL_TTL_SECONDS — it is never stored or reused.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length > 200) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  const tokenHash = hashToken(token);
  let fileId = req.nextUrl.searchParams.get("file");

  if (fileId && !UUID_RE.test(fileId)) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  if (!fileId) {
    let matches;
    try {
      matches = await lookupActiveFiles(tokenHash);
    } catch (err) {
      console.error("download lookup failed", err);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
    if (matches.length !== 1) {
      return NextResponse.json({ error: "This link is no longer available." }, { status: 404 });
    }
    fileId = matches[0].id;
  }

  let consumed;
  try {
    consumed = await consumeDownloadById(tokenHash, fileId);
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
