"use client";

import { hasConsent } from "./consent";

const KEY = "cratelink:history";
const MAX_ENTRIES = 20;

export interface HistoryEntry {
  shareUrl: string;
  publicToken: string;
  filename: string;
  expiresAt: string | null;
  isPermanent: boolean;
  createdAt: string;
}

/**
 * "Recent links" for this browser only — there are no accounts to attach
 * a real history to, so this is exactly what it looks like: a capped list
 * in localStorage, gated behind the same consent as the QR-persistence
 * feature (components/ConsentBanner.tsx). Never written to without
 * consent, never read anywhere but the browser.
 */
export function getHistory(): HistoryEntry[] {
  if (!hasConsent()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addToHistory(entries: HistoryEntry[]): void {
  if (!hasConsent() || entries.length === 0) return;
  try {
    const existing = getHistory();
    const merged = [...entries, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // storage unavailable — non-fatal, history just won't persist
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Entries that haven't expired (or are permanent) — stale ones are just noise. */
export function getActiveHistory(): HistoryEntry[] {
  const now = Date.now();
  return getHistory().filter((e) => e.isPermanent || (e.expiresAt && new Date(e.expiresAt).getTime() > now));
}
