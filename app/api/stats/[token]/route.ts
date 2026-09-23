import { NextRequest, NextResponse } from "next/server";
import { lookupActiveFiles } from "@/lib/queries";
import { hashToken } from "@/lib/token";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public stats for a share link: download count, remaining downloads,
 * when it was created, when it expires. No new privilege here — anyone
 * who already has the token can see this same information (and more) on
 * the /f/[token] download page itself; this just exposes it as its own
 * small JSON endpoint so the UI can show/refresh it without a full page
 * reload. Uses the exact same validity predicate as the download page and
 * consume_download, so an expired/exhausted/unknown token gets the same
 * generic "not found" response here as everywhere else in the app —
 * stats don't outlive the link.
 *
 * `?file=<id>` scopes to one file within a crate (ARCHITECTURE.md §22);
 * without it, this only resolves when the token matches exactly one
 * active file, matching /api/download/[token]'s fallback behavior.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length > 200) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  const fileId = req.nextUrl.searchParams.get("file");
  if (fileId && !UUID_RE.test(fileId)) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  let files;
  try {
    files = await lookupActiveFiles(hashToken(token));
  } catch (err) {
    console.error("stats lookup failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  const file = fileId ? files.find((f) => f.id === fileId) : files.length === 1 ? files[0] : undefined;

  if (!file) {
    return NextResponse.json({ error: "This link is no longer available." }, { status: 404 });
  }

  return NextResponse.json({
    downloadCount: file.download_count,
    maxDownloads: file.max_downloads,
    createdAt: file.created_at,
    expiresAt: file.expires_at,
    isPermanent: file.is_permanent,
  });
}
