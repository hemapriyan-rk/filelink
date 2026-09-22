"use client";

import { useCallback, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { generateQrDataUrl } from "@/lib/qr";
import {
  ALLOWED_EXPIRATIONS_MINUTES,
  ALLOWED_MAX_DOWNLOADS,
  EXPIRATION_LABELS,
  MAX_EXPIRATION_MINUTES,
  MAX_FILE_SIZE_BYTES,
  MIN_EXPIRATION_MINUTES,
  STORAGE_BUCKET,
} from "@/lib/constants";
import { CountdownTimer } from "./CountdownTimer";

type Stage = "idle" | "uploading" | "ready" | "error";
const CUSTOM = "custom" as const;

type CustomUnit = "minutes" | "hours" | "days";

const UNIT_MINUTES: Record<CustomUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

interface ReadyResult {
  shareUrl: string;
  publicToken: string;
  filename: string;
  expiresAt: string | null;
  isPermanent: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [expirationChoice, setExpirationChoice] = useState<string>(String(ALLOWED_EXPIRATIONS_MINUTES[1]));
  const [customAmount, setCustomAmount] = useState<number>(2);
  const [customUnit, setCustomUnit] = useState<CustomUnit>("hours");
  const [maxDownloads, setMaxDownloads] = useState<number | "">("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadyResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((f: File | null) => {
    setError(null);
    if (f && f.size > MAX_FILE_SIZE_BYTES) {
      setError(`File exceeds the ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB limit.`);
      return;
    }
    setFile(f);
  }, []);

  function resolveExpiresMinutes(): number | null {
    if (expirationChoice !== CUSTOM) return Number(expirationChoice);
    const raw = Math.round(customAmount * UNIT_MINUTES[customUnit]);
    if (!Number.isFinite(raw) || raw < MIN_EXPIRATION_MINUTES) return null;
    return Math.min(raw, MAX_EXPIRATION_MINUTES);
  }

  async function handleUpload() {
    if (!file) return;
    const expiresMinutes = resolveExpiresMinutes();
    if (expiresMinutes === null) {
      setError("Enter a valid custom expiration.");
      setStage("error");
      return;
    }

    setStage("uploading");
    setError(null);

    try {
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          expiresMinutes,
          maxDownloads: maxDownloads === "" ? null : maxDownloads,
        }),
      });

      if (!initRes.ok) {
        const body = await initRes.json().catch(() => ({}));
        throw new Error(body.error || "Could not start upload.");
      }

      const init = await initRes.json();

      const supabase = getSupabaseBrowser();
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .uploadToSignedUrl(init.storagePath, init.signedToken, file, {
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        throw new Error("Upload failed. Please try again.");
      }

      const confirmRes = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: init.uploadId }),
      });

      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({}));
        throw new Error(body.error || "Could not confirm upload.");
      }

      const confirmed = await confirmRes.json();

      const finalResult: ReadyResult = {
        shareUrl: init.shareUrl,
        publicToken: init.publicToken,
        filename: file.name,
        expiresAt: confirmed.expiresAt,
        isPermanent: false,
      };
      setResult(finalResult);
      setQrDataUrl(await generateQrDataUrl(init.shareUrl));
      setStage("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  }

  async function handleKeepPermanently() {
    if (!result) return;
    setPromoting(true);
    try {
      const res = await fetch(`/api/keep-permanent/${result.publicToken}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not keep this file permanently.");
      }
      setResult({ ...result, isPermanent: true, expiresAt: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPromoting(false);
    }
  }

  async function handleCopyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — non-fatal.
    }
  }

  function handleDownloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = "cratelink-qr.png";
    a.click();
  }

  function reset() {
    setFile(null);
    setResult(null);
    setQrDataUrl(null);
    setStage("idle");
    setError(null);
  }

  if (stage === "ready" && result) {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <p className="font-display text-2xl text-[var(--crate-red)]">PARCEL READY</p>
        <p className="font-medium break-all">{result.filename}</p>
        <CountdownTimer expiresAt={result.expiresAt} isPermanent={result.isPermanent} />

        {qrDataUrl && (
          <div className="rounded-lg bg-white p-3 border border-[var(--line)] shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code linking to the share URL" width={200} height={200} />
          </div>
        )}

        <p className="font-data text-xs text-[var(--ink-soft)] break-all px-2">{result.shareUrl}</p>

        <div className="flex flex-col gap-2.5 w-full">
          <button
            onClick={handleCopyLink}
            className="w-full rounded-md border border-[var(--crate-red)] text-[var(--crate-red)] py-2.5 text-sm font-medium hover:bg-[var(--crate-red)] hover:text-white transition-colors"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={handleDownloadQr}
            className="w-full rounded-md border border-[var(--crate-red)] text-[var(--crate-red)] py-2.5 text-sm font-medium hover:bg-[var(--crate-red)] hover:text-white transition-colors"
          >
            Save QR code
          </button>
          {!result.isPermanent && (
            <button
              onClick={handleKeepPermanently}
              disabled={promoting}
              className="w-full rounded-md bg-[var(--crate-red)] text-white py-2.5 text-sm font-medium hover:bg-[var(--crate-red-deep)] transition-colors disabled:opacity-50"
            >
              {promoting ? "Saving…" : "Keep permanently"}
            </button>
          )}
        </div>

        {error && <p className="text-sm text-[var(--crate-red)]">{error}</p>}

        <button onClick={reset} className="text-xs text-[var(--ink-soft)] underline mt-1">
          Send another file
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          pickFile(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`h-40 sm:h-44 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors text-center px-4 ${
          dragActive
            ? "border-[var(--crate-red)] bg-[var(--crate-red)]/5"
            : "border-[var(--ink)]/25 hover:border-[var(--crate-red)]/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <p className="font-medium break-all">{file.name}</p>
            <p className="text-sm text-[var(--ink-soft)] font-data">{formatBytes(file.size)}</p>
          </>
        ) : (
          <>
            <p className="font-medium">Drop a file here</p>
            <p className="text-sm text-[var(--ink-soft)]">or tap to browse</p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span>Expires</span>
          </div>
          <select
            value={expirationChoice}
            onChange={(e) => setExpirationChoice(e.target.value)}
            className="w-full bg-white border border-[var(--line)] rounded-md px-3 py-2 text-sm"
          >
            {ALLOWED_EXPIRATIONS_MINUTES.map((m) => (
              <option key={m} value={m}>
                {EXPIRATION_LABELS[m]}
              </option>
            ))}
            <option value={CUSTOM}>Custom…</option>
          </select>

          {expirationChoice === CUSTOM && (
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                min={1}
                value={customAmount}
                onChange={(e) => setCustomAmount(Number(e.target.value))}
                className="w-20 bg-white border border-[var(--line)] rounded-md px-3 py-2 text-sm font-data"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as CustomUnit)}
                className="flex-1 bg-white border border-[var(--line)] rounded-md px-3 py-2 text-sm"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <div className="text-sm mb-1.5">Downloads</div>
          <select
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full bg-white border border-[var(--line)] rounded-md px-3 py-2 text-sm"
          >
            <option value="">Unlimited</option>
            {ALLOWED_MAX_DOWNLOADS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--crate-red)] text-center">{error}</p>}

      <button
        onClick={handleUpload}
        disabled={!file || stage === "uploading"}
        className="w-full rounded-md bg-[var(--crate-red)] text-white font-medium py-3 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--crate-red-deep)] transition-colors"
      >
        {stage === "uploading" ? "Shipping…" : "Ship it"}
      </button>
    </div>
  );
}
