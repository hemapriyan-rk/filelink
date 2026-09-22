import { describe, expect, it } from "vitest";
import { sanitizeFilename, sanitizeMimeType } from "@/lib/sanitize";

describe("sanitizeFilename", () => {
  it("strips path separators so a filename can never encode a path", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("..\\..\\windows\\system32\\config")).not.toContain("\\");
  });

  it("strips control characters and newlines (header injection)", () => {
    const withInjection = 'evil.txt"\r\nX-Injected: true';
    const result = sanitizeFilename(withInjection);
    expect(result).not.toMatch(/[\r\n]/);
  });

  it("falls back to a default name for empty input", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("   ")).toBe("file");
  });

  it("preserves a normal filename unchanged", () => {
    expect(sanitizeFilename("report-2026.pdf")).toBe("report-2026.pdf");
  });

  it("truncates very long filenames while keeping the extension", () => {
    const long = "a".repeat(400) + ".pdf";
    const result = sanitizeFilename(long);
    expect(result.length).toBeLessThanOrEqual(255);
    expect(result.endsWith(".pdf")).toBe(true);
  });
});

describe("sanitizeMimeType", () => {
  it("passes through a well-formed mime type", () => {
    expect(sanitizeMimeType("image/png")).toBe("image/png");
  });

  it("falls back to a safe default for garbage input", () => {
    expect(sanitizeMimeType("<script>alert(1)</script>")).toBe("application/octet-stream");
    expect(sanitizeMimeType("")).toBe("application/octet-stream");
  });
});
