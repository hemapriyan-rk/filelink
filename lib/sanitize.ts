/**
 * Sanitizes a client-supplied filename for safe storage and display.
 *
 * This is defense in depth only — the storage path is always a random,
 * server-generated value (see lib/token.ts), so nothing derived from this
 * function ever influences where a file lives on disk. Path traversal via
 * filename is structurally impossible in this app, not just filtered.
 *
 * What this function guards against instead:
 *  - control characters / newlines leaking into HTTP headers
 *    (Content-Disposition) when we later serve the file for download
 *  - unreasonably long names
 *  - empty names
 */
export function sanitizeFilename(rawName: string): string {
  const base = (rawName || "").normalize("NFC");

  // Strip path separators and control/newline characters (header injection).
  let cleaned = base.replace(/[\/\\\u0000-\u001f\u007f]/g, "").trim();

  if (cleaned.length === 0) {
    cleaned = "file";
  }

  if (cleaned.length > 255) {
    const dot = cleaned.lastIndexOf(".");
    const ext = dot > 0 && dot > cleaned.length - 16 ? cleaned.slice(dot) : "";
    cleaned = cleaned.slice(0, 255 - ext.length) + ext;
  }

  return cleaned;
}

export function sanitizeMimeType(rawMime: string): string {
  const trimmed = (rawMime || "").trim();
  if (!trimmed || trimmed.length > 255 || !/^[\w.+-]+\/[\w.+-]+$/.test(trimmed)) {
    return "application/octet-stream";
  }
  return trimmed;
}
