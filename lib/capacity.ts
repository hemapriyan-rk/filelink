import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { serverEnv } from "./env";
import {
  DEFAULT_STORAGE_QUOTA_BYTES,
  STORAGE_FULL_RATIO,
  STORAGE_NEAR_FULL_RATIO,
} from "./constants";

export type CapacityStatus = "ok" | "near_full" | "full";

export interface Capacity {
  usedBytes: number;
  quotaBytes: number;
  ratio: number;
  status: CapacityStatus;
}

/**
 * How full the storage bucket is, as a fraction of the configured quota.
 * See total_storage_used() (supabase/migrations/0003_capacity.sql) for why
 * this is computed from our own table rather than queried from Supabase
 * directly — there's no Management API token available to ask it.
 */
export async function getCapacity(): Promise<Capacity> {
  const admin = getSupabaseAdmin();
  const quotaBytes = serverEnv.storageQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES;

  const { data, error } = await admin.rpc("total_storage_used");
  if (error) {
    console.error("getCapacity failed", error);
    // Fail open on a read error rather than blocking every upload because
    // of a transient RPC hiccup — the per-file and per-batch size limits
    // still apply regardless.
    return { usedBytes: 0, quotaBytes, ratio: 0, status: "ok" };
  }

  const usedBytes = typeof data === "number" ? data : Number(data ?? 0);
  const ratio = quotaBytes > 0 ? usedBytes / quotaBytes : 0;
  const status: CapacityStatus =
    ratio >= STORAGE_FULL_RATIO ? "full" : ratio >= STORAGE_NEAR_FULL_RATIO ? "near_full" : "ok";

  return { usedBytes, quotaBytes, ratio, status };
}
