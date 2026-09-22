// Shared constants. Values here are safe to import from both server and
// client code (no secrets), but the arrays are also re-validated server-side
// on every request — never trust that the client actually sent one of these.

export const STORAGE_BUCKET = "droplink";

export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

// Quick-select presets shown in the UI. The server does not require an
// exact match against this list — it validates against MIN/MAX below —
// these are just convenient shortcuts, with "Custom" covering everything
// else in between.
export const ALLOWED_EXPIRATIONS_MINUTES = [10, 60, 360, 1440, 4320, 10080] as const;

export const EXPIRATION_LABELS: Record<number, string> = {
  10: "10 minutes",
  60: "1 hour",
  360: "6 hours",
  1440: "1 day",
  4320: "3 days",
  10080: "7 days",
};

export const MIN_EXPIRATION_MINUTES = 1;
export const MAX_EXPIRATION_MINUTES = 30 * 24 * 60; // 30 days

export const ALLOWED_MAX_DOWNLOADS = [1, 5, 10] as const;

export const SIGNED_DOWNLOAD_URL_TTL_SECONDS = 60;

export const PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000; // 1 hour

export const CLEANUP_BATCH_SIZE = 200;
