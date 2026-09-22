"use client";

import { useState } from "react";

interface Stats {
  downloadCount: number;
  maxDownloads: number | null;
  createdAt: string;
  expiresAt: string | null;
  isPermanent: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatExpires(stats: Stats): string {
  if (stats.isPermanent) return "Never (kept permanently)";
  if (!stats.expiresAt) return "—";
  const ms = new Date(stats.expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  return formatDate(stats.expiresAt);
}

export function StatsToggle({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not load stats.");
      }
      setStats(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load stats.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="text-xs text-[var(--ink-soft)] underline"
      >
        {open ? "Hide stats" : "Stats"}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-[var(--line)] bg-white/70 p-3 text-xs font-data">
          {loading && <p className="text-[var(--ink-soft)]">Loading…</p>}
          {error && <p className="text-[var(--crate-red)]">{error}</p>}
          {stats && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-[var(--ink-soft)]">Downloads</dt>
              <dd>{stats.downloadCount}</dd>

              <dt className="text-[var(--ink-soft)]">Remaining</dt>
              <dd>
                {stats.maxDownloads === null
                  ? "Unlimited"
                  : Math.max(0, stats.maxDownloads - stats.downloadCount)}
              </dd>

              <dt className="text-[var(--ink-soft)]">Created</dt>
              <dd>{formatDate(stats.createdAt)}</dd>

              <dt className="text-[var(--ink-soft)]">Expires</dt>
              <dd>{formatExpires(stats)}</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
