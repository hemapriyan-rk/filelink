import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { STORAGE_BUCKET, CLEANUP_BATCH_SIZE } from "./constants";

export interface CleanupSummary {
  removed: number;
  failed: number;
}

interface CleanupCandidate {
  id: string;
  storage_path: string;
  previous_status: "pending" | "active";
}

/**
 * Idempotent cleanup sweep. Safe to run concurrently with itself and safe
 * to re-run after a partial failure:
 *
 *  - Candidates come from the cleanup_candidates() SQL function (see the
 *    migration), which does the two-column comparison (download_count vs
 *    max_downloads) that PostgREST filters can't express.
 *  - Storage deletion happens BEFORE the row is marked "deleted". If storage
 *    deletion fails, the row is left as-is so the next run retries it — the
 *    database never claims an object was deleted when it wasn't
 *    (ARCHITECTURE.md, Case D/E).
 *  - The status update is guarded with `.eq("status", previous_status)`, so
 *    a row that changed state between the select and the update (e.g. a
 *    user clicked "Keep Permanently" microseconds earlier) is safely
 *    skipped rather than overwritten (ARCHITECTURE.md, Case B).
 *  - Supabase Storage's remove() does not error on an already-missing
 *    object, so a row whose object was deleted on a previous run but whose
 *    status update failed to commit will be cleaned up correctly next time.
 */
export async function runCleanupSweep(): Promise<CleanupSummary> {
  const admin = getSupabaseAdmin();
  const summary: CleanupSummary = { removed: 0, failed: 0 };

  const { data, error } = await admin.rpc("cleanup_candidates", { p_limit: CLEANUP_BATCH_SIZE });
  if (error) throw error;

  const candidates = (data ?? []) as CleanupCandidate[];

  for (const row of candidates) {
    const { error: removeError } = await admin.storage.from(STORAGE_BUCKET).remove([row.storage_path]);

    if (removeError) {
      console.error("cleanup: failed to delete storage object", row.storage_path, removeError);
      summary.failed += 1;
      continue;
    }

    const { error: updateError } = await admin
      .from("files")
      .update({ status: "deleted" })
      .eq("id", row.id)
      .eq("status", row.previous_status);

    if (updateError) {
      console.error("cleanup: failed to mark row deleted", row.id, updateError);
      summary.failed += 1;
    } else {
      summary.removed += 1;
    }
  }

  return summary;
}
