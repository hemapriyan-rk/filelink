"use client";

/**
 * Consent for the one piece of client-side persistence this app does:
 * remembering the visitor's last upload result(s) in sessionStorage so a
 * tab switch or accidental refresh doesn't lose an un-copied share
 * link/QR code. This is NOT an HTTP cookie — nothing here is ever sent to
 * the server, it's purely local to the browser tab and clears itself when
 * the tab closes. Still gated behind an explicit yes/no so the choice is
 * the visitor's, not assumed.
 */
const KEY = "cratelink:consent";

export function getStoredConsent(): "accepted" | "declined" | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

export function setStoredConsent(value: "accepted" | "declined") {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // localStorage unavailable (private mode, blocked) — consent just
    // won't persist across visits; the banner will show again, harmless.
  }
}

export function hasConsent(): boolean {
  return getStoredConsent() === "accepted";
}
