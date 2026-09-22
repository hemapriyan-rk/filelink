"use client";

import { useEffect, useState } from "react";
import { generateQrDataUrl } from "@/lib/qr";
import { clearHistory, getActiveHistory, type HistoryEntry } from "@/lib/history";
import { hasConsent } from "@/lib/consent";

function RecentLinkRow({ entry }: { entry: HistoryEntry }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  async function toggleQr() {
    if (!showQr && !qrDataUrl) {
      setQrDataUrl(await generateQrDataUrl(entry.shareUrl));
    }
    setShowQr((v) => !v);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(entry.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // non-fatal
    }
  }

  return (
    <div className="border border-[var(--line)] rounded-md p-3 bg-white/60">
      <p className="text-sm font-medium truncate">{entry.filename}</p>
      <p className="font-data text-xs text-[var(--ink-soft)] break-all mt-1">{entry.shareUrl}</p>
      {showQr && qrDataUrl && (
        <div className="mt-2 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`QR code for ${entry.filename}`}
            width={120}
            height={120}
            className="rounded bg-white p-2 border border-[var(--line)]"
          />
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <button
          onClick={copyLink}
          className="rounded-md border border-[var(--crate-red)] text-[var(--crate-red)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--crate-red)] hover:text-white transition-colors"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={toggleQr}
          className="rounded-md border border-[var(--crate-red)] text-[var(--crate-red)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--crate-red)] hover:text-white transition-colors"
        >
          {showQr ? "Hide QR" : "Show QR"}
        </button>
      </div>
    </div>
  );
}

export function RecentLinks() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasConsent()) return;
    // localStorage is browser-only; this can only run after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(getActiveHistory());
  }, []);

  if (!entries || entries.length === 0) return null;

  return (
    <div className="w-full max-w-xl mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-[var(--ink-soft)] underline"
      >
        {open ? "Hide recent links" : `Recent links (${entries.length})`}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2 max-h-80 overflow-y-auto">
          {entries.map((entry) => (
            <RecentLinkRow key={entry.publicToken} entry={entry} />
          ))}
          <button
            onClick={() => {
              clearHistory();
              setEntries([]);
              setOpen(false);
            }}
            className="text-xs text-[var(--ink-soft)] underline self-center mt-1"
          >
            Clear recent links
          </button>
        </div>
      )}
    </div>
  );
}
