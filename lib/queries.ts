import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { STORAGE_BUCKET } from "./constants";
import type { ConsumeDownloadRow, FileRow } from "./types";

/**
 * Read-only lookup used by the /f/[token] page to display file info
 * (name, size, expiry countdown) WITHOUT counting as a download. Applies
 * the exact same validity predicate as consumeDownload(ById) so a file
 * that shows as available here will also be downloadable, and one that's
 * expired here is never downloadable.
 *
 * Returns an array because a token no longer necessarily maps to exactly
 * one row — a "crate" (ARCHITECTURE.md §22) is several files sharing one
 * token_hash, browsed and downloaded individually. The common single-file
 * case is just an array of length 1; callers that only ever care about
 * that case can keep using lookupActiveFile below.
 */
export async function lookupActiveFiles(tokenHash: string): Promise<FileRow[]> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("files")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .or(`is_permanent.eq.true,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return (data as FileRow[]).filter(
    (row) => row.max_downloads === null || row.download_count < row.max_downloads
  );
}

/** Convenience wrapper for call sites that only expect a single file. */
export async function lookupActiveFile(tokenHash: string): Promise<FileRow | null> {
  const rows = await lookupActiveFiles(tokenHash);
  return rows[0] ?? null;
}

/**
 * Atomically validates the token AND increments download_count in a single
 * UPDATE statement (see the consume_download SQL function). This is what
 * makes concurrent downloads against a max_downloads limit race-free:
 * Postgres serializes concurrent updates to the same row, so only as many
 * callers as there are remaining slots can ever get a row back.
 *
 * Only valid when the token maps to exactly one file — see
 * consumeDownloadById for the crate case, where a token can match several
 * rows and the specific one being downloaded must be named explicitly.
 */
export async function consumeDownload(tokenHash: string): Promise<ConsumeDownloadRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("consume_download", { p_token_hash: tokenHash });
  if (error) throw error;
  const rows = data as ConsumeDownloadRow[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}

/** Same atomicity as consumeDownload, scoped to one specific file within a token's group. */
export async function consumeDownloadById(
  tokenHash: string,
  fileId: string
): Promise<ConsumeDownloadRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("consume_download_by_id", {
    p_token_hash: tokenHash,
    p_file_id: fileId,
  });
  if (error) throw error;
  const rows = data as ConsumeDownloadRow[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Flips every active, non-permanent, not-yet-expired file sharing a token
 * to permanent — for a single-file share that's just the one file; for a
 * crate, "Keep Permanently" applies to the whole crate at once, which is
 * the only semantics that makes sense for the recipient's benefit (they
 * don't see or choose individual files' permanence). The WHERE clause
 * doubles as the concurrency guard against the cleanup sweep
 * (ARCHITECTURE.md, Case B) for every row it touches, exactly as before.
 */
export async function promoteToPermanent(
  tokenHash: string
): Promise<{ id: string; storagePath: string }[]> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("files")
    .update({ is_permanent: true, expires_at: null })
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .eq("is_permanent", false)
    .gt("expires_at", nowIso)
    .select("id, storage_path");

  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, storagePath: row.storage_path }));
}

export async function updateStoragePath(id: string, newPath: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("files").update({ storage_path: newPath }).eq("id", id);
  if (error) throw error;
}

export async function objectExists(storagePath: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const lastSlash = storagePath.lastIndexOf("/");
  const folder = storagePath.slice(0, lastSlash);
  const name = storagePath.slice(lastSlash + 1);

  const { data, error } = await admin.storage.from(STORAGE_BUCKET).list(folder, {
    limit: 1,
    search: name,
  });
  if (error) throw error;
  return !!data?.some((entry) => entry.name === name);
}
