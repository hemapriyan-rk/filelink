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
};

// Safe to import from client components.
export const clientEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get siteUrl() {
    return required("NEXT_PUBLIC_SITE_URL");
  },
};
