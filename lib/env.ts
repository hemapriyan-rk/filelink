function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Server-only. Importing this file from a "use client" component is a bug —
// it would throw at runtime because supabaseServiceRoleKey and cronSecret are
// intentionally not prefixed with NEXT_PUBLIC_ and are never sent to the
// browser.
export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  get siteUrl() {
    return required("NEXT_PUBLIC_SITE_URL");
  },
  /**
   * Base32 TOTP secret for the admin override code. Optional by design —
   * if it's not configured, adminCode is simply never accepted and every
   * upload is held to the standard limits. Never sent to the browser.
   */
  get adminTotpSecret(): string | null {
    return process.env.ADMIN_TOTP_SECRET || null;
  },
  /**
   * Override for DEFAULT_STORAGE_QUOTA_BYTES (lib/constants.ts) — set this
   * to your actual Supabase plan's storage quota in bytes if it differs
   * from the 1 GB default. Optional; falls back to the default when unset
   * or not a valid positive number.
   */
  get storageQuotaBytes(): number | null {
    const raw = process.env.STORAGE_QUOTA_BYTES;
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  },
};

// Safe to import from client components.
//
// Next.js only inlines NEXT_PUBLIC_* values into the browser bundle when it
// sees the literal, static expression `process.env.NEXT_PUBLIC_X` at build
// time — that's a compile-time text replacement, not a runtime lookup (the
// browser has no real process.env at all). Routing this through the generic
// required(name) helper above (which reads process.env[name] with a
// variable key) defeats that static analysis, so the value silently never
// makes it into the client bundle. Each client-side getter below must
// therefore reference its own NEXT_PUBLIC_ variable directly and statically.
function requiredPublic(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const clientEnv = {
  get supabaseUrl() {
    return requiredPublic(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return requiredPublic(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  },
  get siteUrl() {
    return requiredPublic(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");
  },
};
