import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "./env";

/**
 * Service-role Supabase client. Bypasses Row Level Security and has full
 * storage access. Must only ever be constructed in server-side code
 * (route handlers, server components, the cron job) — the `server-only`
 * import above makes it a build-time error to pull this into a client
 * bundle.
 */
export function getSupabaseAdmin() {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
