import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { STORAGE_BUCKET } from "./constants";
import type { ConsumeDownloadRow, FileRow } from "./types";

/**
 * Read-only lookup used by the /f/[token] page to display file info
 * (name, size, expiry countdown) WITHOUT counting as a download. Applies
 * the exact same validity predicate as consumeDownload so a file that shows
 * as available here will also be downloadable, and one that's expired here
 * is never downloadable.
 */
export async function lookupActiveFile(tokenHash: string): Promise<FileRow | null> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("files")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .or(`is_permanent.eq.true,expires_at.gt.${nowIso}`)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as FileRow;
  if (row.max_downloads !== null && row.download_count >= row.max_downloads) {
    return null;
  }
  return row;
}

/**
 * Atomically validates the token AND increments download_count in a single
 * UPDATE statement (see the consume_download SQL function). This is what
 * makes concurrent downloads against a max_downloads limit race-free:
 * Postgres serializes concurrent updates to the same row, so only as many
 * callers as there are remaining slots can ever get a row back.
 */
export async function consumeDownload(tokenHash: string): Promise<ConsumeDownloadRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("consume_download", { p_token_hash: tokenHash });
  if (error) throw error;
  const rows = data as ConsumeDownloadRow[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Flips a temporary file to permanent. The WHERE clause doubles as the
 * concurrency guard against the cleanup sweep (see ARCHITECTURE.md, Case B):
 * whichever of "promote" or "cleanup marks it deleted" commits first wins,
 * and the loser's WHERE clause simply matches zero rows.
 */
export async function promoteToPermanent(
  tokenHash: string
): Promise<{ id: string; storagePath: string } | null> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("files")
    .update({ is_permanent: true, expires_at: null })
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .eq("is_permanent", false)
    .gt("expires_at", nowIso)
    .select("id, storage_path")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { id: data.id, storagePath: data.storage_path };
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
