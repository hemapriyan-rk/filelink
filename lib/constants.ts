// Shared constants. Values here are safe to import from both server and
// client code (no secrets), but the arrays are also re-validated server-side
// on every request — never trust that the client actually sent one of these.

export const STORAGE_BUCKET = "droplink";

export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

// Quick-select presets shown in the UI. The server does not require an
// exact match against this list — it validates against MIN/MAX below —
// these are just convenient shortcuts, with "Custom" covering everything
// else in between. First entry is the UI's default selection.
export const ALLOWED_EXPIRATIONS_MINUTES = [1, 2, 5, 10, 60, 360, 1440, 4320, 10080] as const;

export const EXPIRATION_LABELS: Record<number, string> = {
  1: "1 minute",
  2: "2 minutes",
  5: "5 minutes",
  10: "10 minutes",
  60: "1 hour",
  360: "6 hours",
  1440: "1 day",
  4320: "3 days",
  10080: "7 days",
};

export const MIN_EXPIRATION_MINUTES = 1;
export const MAX_EXPIRATION_MINUTES = 30 * 24 * 60; // 30 days — standard cap

// Elevated limits, only unlocked by a valid admin TOTP code (see lib/totp.ts).
// Still finite — "admin" raises the ceiling, it doesn't remove one.
export const MAX_FILE_SIZE_BYTES_ADMIN = 5 * 1024 * 1024 * 1024; // 5 GB
export const MAX_EXPIRATION_MINUTES_ADMIN = 365 * 24 * 60; // 1 year

// Quick-select presets; "Custom" (like expiration) covers anything else
// within MIN/MAX_DOWNLOADS_LIMIT below, which the server actually enforces.
export const ALLOWED_MAX_DOWNLOADS = [1, 5, 10] as const;
export const MIN_DOWNLOADS_LIMIT = 1;
export const MAX_DOWNLOADS_LIMIT = 100_000; // effectively "unlimited" but still bounded

// Storage capacity gating. Supabase's free tier storage quota is small
// (roughly 1 GB at the time of writing) and this app has no way to query
// it directly via the anon/service-role keys — no Management API token —
// so instead it tracks the one number it actually controls: the sum of
// size_bytes across every row this app has ever written that isn't
// deleted yet. That's an accurate proxy as long as this bucket is only
// ever written to by this app, which it is. Override via
// STORAGE_QUOTA_BYTES if your actual plan's quota differs.
export const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB
// Above this fraction of quota used: restrict everyone to the shortest
// expiration (faster turnover, sooner cleanup) and show a disclaimer.
export const STORAGE_NEAR_FULL_RATIO = 0.85;
// Above this fraction: reject new uploads outright.
export const STORAGE_FULL_RATIO = 0.97;
// The one expiration allowed while near-full.
export const NEAR_FULL_EXPIRATION_MINUTES = 10;
// Headroom kept back from an admin-code upload even when there's
// technically more room than that — never let one admin upload consume
// every remaining byte.
export const ADMIN_UPLOAD_SAFETY_MARGIN_BYTES = 50 * 1024 * 1024; // 50 MB

export const SIGNED_DOWNLOAD_URL_TTL_SECONDS = 60;

// Expiration only starts counting once the file has actually finished
// uploading and been confirmed (see app/api/upload/confirm/route.ts) — not
// at /api/upload/init, before a single byte has been sent. This buffer adds
// a little extra room on top of that confirm moment, covering the round
// trip of the confirm request itself and the instant it takes the browser
// to render the QR code the recipient actually sees.
export const EXPIRATION_START_BUFFER_SECONDS = 60;

export const PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000; // 1 hour

export const CLEANUP_BATCH_SIZE = 200;

// Multi-file upload
export const MAX_FILES_PER_BATCH = 50;

// Abuse strikes -> escalating temporary bans (see lib/abuse.ts and
// supabase/migrations/0002_abuse.sql for the exact mechanics).
export const STRIKE_WINDOW_MINUTES = 30;
export const STRIKE_THRESHOLD = 5;
export const BASE_BAN_MINUTES = 60;
export const MAX_BAN_MINUTES = 24 * 60;
