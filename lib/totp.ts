import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * RFC 6238 TOTP (the same algorithm Google Authenticator / Authy use), with
 * a minimal RFC 4648 base32 codec. No external dependency — this is a
 * small, well-specified algorithm and pulling in a library for it isn't
 * worth the extra supply-chain surface for a single admin code.
 *
 * This exists so raising upload limits (bigger files, longer expiration)
 * requires a fresh 6-digit code from an authenticator app rather than a
 * static shared password — the code is worthless to anyone who doesn't
 * have the authenticator app set up with ADMIN_TOTP_SECRET, and it rotates
 * every 30 seconds even for anyone who glimpses one in transit.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder > 0) {
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }
  return output;
}

function generateTotpAt(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** DIGITS;
  return otp.toString().padStart(DIGITS, "0");
}

/**
 * Verifies a 6-digit code against the current time step, allowing one step
 * of drift in either direction (±30s) to tolerate clock skew between the
 * server and the authenticator app.
 */
export function verifyTotp(secretBase32: string, token: string): boolean {
  const cleanToken = (token || "").trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (const drift of [0, -1, 1]) {
    const expected = generateTotpAt(secretBase32, counter + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(cleanToken);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}
