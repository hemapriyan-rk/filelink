import { describe, expect, it } from "vitest";
import { generatePublicToken, generateStorageKey, hashToken } from "@/lib/token";

describe("generatePublicToken", () => {
  it("produces high-entropy, URL-safe, unique tokens", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generatePublicToken()));
    expect(tokens.size).toBe(1000);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{40,50}$/);
    }
  });

  it("is not predictable from a previous token", () => {
    const a = generatePublicToken();
    const b = generatePublicToken();
    expect(a).not.toBe(b);
    // No shared prefix beyond trivial coincidence.
    let sharedPrefix = 0;
    while (sharedPrefix < a.length && a[sharedPrefix] === b[sharedPrefix]) sharedPrefix++;
    expect(sharedPrefix).toBeLessThan(4);
  });
});

describe("generateStorageKey", () => {
  it("is independent of the public token format-wise but equally random", () => {
    const keys = new Set(Array.from({ length: 500 }, () => generateStorageKey()));
    expect(keys.size).toBe(500);
  });
});

describe("hashToken", () => {
  it("is deterministic", () => {
    const token = generatePublicToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("produces a 64-char hex sha256 digest", () => {
    expect(hashToken("anything")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("different tokens hash to different values", () => {
    const a = hashToken(generatePublicToken());
    const b = hashToken(generatePublicToken());
    expect(a).not.toBe(b);
  });
});
