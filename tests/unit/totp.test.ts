import { describe, expect, it, vi } from "vitest";
import { base32Encode, verifyTotp } from "@/lib/totp";

// RFC 6238 Appendix B test vector: ASCII secret "12345678901234567890",
// SHA1, 30s step, T0=0. At Unix time 59 (counter = 1), the reference
// 8-digit TOTP is 94287082. Our implementation truncates to 6 digits via
// the same `binary % 10^6` step the RFC's 8-digit truncation uses
// (`binary % 10^8`), so the correct 6-digit value is just the last 6
// digits of the reference value: "287082". We base32-encode the raw
// ASCII secret because real authenticator apps only ever hand you a
// base32 secret — verifyTotp always expects one.
const RFC_SECRET_BASE32 = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("verifyTotp — RFC 6238 test vector", () => {
  it("accepts the known-correct code at the known-correct time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(59 * 1000);
    expect(verifyTotp(RFC_SECRET_BASE32, "287082")).toBe(true);
    vi.useRealTimers();
  });

  it("rejects a wrong code at that same time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(59 * 1000);
    expect(verifyTotp(RFC_SECRET_BASE32, "000000")).toBe(false);
    vi.useRealTimers();
  });
});

describe("verifyTotp — behavior", () => {
  it("round-trips: a code generated for 'now' verifies against 'now'", () => {
    // Reuse the RFC vector's generator behavior indirectly: since we don't
    // export a generator, drive it via a fixed time and the known vector
    // at a second known offset (T=1111111109, counter=37037036 -> 07081804).
    vi.useFakeTimers();
    vi.setSystemTime(1111111109 * 1000);
    expect(verifyTotp(RFC_SECRET_BASE32, "081804")).toBe(true);
    vi.useRealTimers();
  });

  it("tolerates one step of clock drift (±30s)", () => {
    vi.useFakeTimers();
    // Code valid at t=59 (counter 1) should still verify at t=61 (counter 2).
    vi.setSystemTime(61 * 1000);
    expect(verifyTotp(RFC_SECRET_BASE32, "287082")).toBe(true);
    vi.useRealTimers();
  });

  it("rejects codes outside the drift window", () => {
    vi.useFakeTimers();
    // counter 1 -> code "287082"; jump 3 steps ahead (t=119, counter 3).
    vi.setSystemTime(119 * 1000);
    expect(verifyTotp(RFC_SECRET_BASE32, "287082")).toBe(false);
    vi.useRealTimers();
  });

  it("rejects malformed input without throwing", () => {
    expect(verifyTotp(RFC_SECRET_BASE32, "")).toBe(false);
    expect(verifyTotp(RFC_SECRET_BASE32, "abcdef")).toBe(false);
    expect(verifyTotp(RFC_SECRET_BASE32, "12345")).toBe(false);
    expect(verifyTotp(RFC_SECRET_BASE32, "1234567")).toBe(false);
  });
});

describe("base32Encode", () => {
  it("matches a known base32 encoding", () => {
    expect(base32Encode(Buffer.from("12345678901234567890", "ascii"))).toBe(
      "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    );
  });
});
