"use client";

import { createClient } from "@supabase/supabase-js";
import { clientEnv } from "./env";

/**
 * Browser-side Supabase client. Built with the anon key only, which is safe
 * to ship — Row Level Security denies anon/authenticated access to the
 * `files` table entirely (see supabase/migrations/0001_init.sql), and the
 * storage bucket is private. This client is used for exactly one thing:
 * uploading a file directly to Supabase Storage using a short-lived,
 * per-upload signed token minted server-side (see app/api/upload/init).
 * It never queries the database.
 */
export function getSupabaseBrowser() {
  return createClient(clientEnv.supabaseUrl, clientEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
