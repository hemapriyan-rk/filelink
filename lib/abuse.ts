import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  STRIKE_WINDOW_MINUTES,
  STRIKE_THRESHOLD,
  BASE_BAN_MINUTES,
  MAX_BAN_MINUTES,
} from "./constants";

export interface BanStatus {
  banned: boolean;
  bannedUntil: string | null;
}

/** Read-only check — call first, before doing any real work for a request. */
export async function checkBan(ip: string): Promise<BanStatus> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("abuse_ips")
    .select("banned_until")
    .eq("ip", ip)
    .maybeSingle();

  if (error) {
    console.error("checkBan failed", error);
    return { banned: false, bannedUntil: null };
  }
  if (!data?.banned_until) return { banned: false, bannedUntil: null };

  const bannedUntil = new Date(data.banned_until);
  if (bannedUntil.getTime() <= Date.now()) return { banned: false, bannedUntil: null };
  return { banned: true, bannedUntil: data.banned_until };
}

/**
 * Records one strike against an IP for a specific abuse signal (oversized
 * upload attempted without a valid admin code, expiration beyond the
 * standard cap without one, a wrong admin code, or repeatedly tripping the
 * request-rate limiter). Once strikes reach the threshold within the
 * rolling window, the IP is banned for an escalating duration — see
 * supabase/migrations/0002_abuse.sql for the exact mechanics.
 */
export async function recordStrike(ip: string): Promise<BanStatus> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("record_strike", {
    p_ip: ip,
    p_strike_window_minutes: STRIKE_WINDOW_MINUTES,
    p_strike_threshold: STRIKE_THRESHOLD,
    p_base_ban_minutes: BASE_BAN_MINUTES,
    p_max_ban_minutes: MAX_BAN_MINUTES,
  });

  if (error) {
    console.error("recordStrike failed", error);
    return { banned: false, bannedUntil: null };
  }
  // The RPC returns Postgres's native snake_case column names
  // (banned, banned_until), not the BanStatus shape — map explicitly
  // rather than trusting a type assertion to do it.
  const row = (data as { banned: boolean; banned_until: string | null }[] | null)?.[0];
  return row ? { banned: row.banned, bannedUntil: row.banned_until } : { banned: false, bannedUntil: null };
}
