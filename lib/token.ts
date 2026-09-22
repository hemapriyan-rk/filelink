import { randomBytes, createHash } from "crypto";

/**
 * The public share token. 256 bits of entropy from a CSPRNG, base64url
 * encoded (~43 chars, URL-safe, no padding). This is the only secret an
 * attacker could try to guess, and 256 bits makes brute-force infeasible.
 * Returned to the uploader exactly once; never stored in plaintext.
 */
export function generatePublicToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 of the public token, stored in the database instead of the raw
 * token. If the database is ever read (backup leak, misconfigured access,
 * SQL injection elsewhere in a future change), the attacker gets hashes,
 * not working download links. Looking up by hash costs one cheap digest per
 * request and an indexed equality lookup, so there is no meaningful
 * performance tradeoff for this extra safety margin.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The storage object path suffix, generated completely independently of the
 * public token. Even if a token/hash pair were somehow recovered, it would
 * not reveal or help derive the storage path, and vice versa.
 */
export function generateStorageKey(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * "yyyy/mm/dd/hh" (UTC) — purely for keeping the bucket organized into
 * manageable, browsable chunks as it grows. Contains no identifying
 * information about the uploader or the file; the random storage key
 * within each folder is still what actually makes an object's location
 * unguessable, exactly as before this existed.
 */
export function datePathPrefix(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}/${hh}`;
}
