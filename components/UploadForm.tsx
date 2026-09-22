"use client";

import { useCallback, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { generateQrDataUrl } from "@/lib/qr";
import {
  ALLOWED_EXPIRATIONS_MINUTES,
  ALLOWED_MAX_DOWNLOADS,
  EXPIRATION_LABELS,
  MAX_FILE_SIZE_BYTES,
  STORAGE_BUCKET,
} from "@/lib/constants";
import { CountdownTimer } from "./CountdownTimer";

type Stage = "idle" | "uploading" | "ready" | "error";

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
  const [expiresMinutes, setExpiresMinutes] = useState<number>(ALLOWED_EXPIRATIONS_MINUTES[1]);
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

  async function handleUpload() {
    if (!file) return;
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
    a.download = "droplink-qr.png";
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
      <div className="w-full max-w-sm flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-neutral-400">File Ready</p>
        <p className="font-medium break-all">{result.filename}</p>
        <CountdownTimer expiresAt={result.expiresAt} isPermanent={result.isPermanent} />

        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="QR code linking to the share URL"
            width={220}
            height={220}
            className="rounded-lg bg-white p-2"
          />
        )}

        <p className="text-xs text-neutral-400 break-all">{result.shareUrl}</p>

        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={handleCopyLink}
            className="w-full rounded-md bg-neutral-800 py-2 text-sm hover:bg-neutral-700 transition"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <button
            onClick={handleDownloadQr}
            className="w-full rounded-md bg-neutral-800 py-2 text-sm hover:bg-neutral-700 transition"
          >
            Download QR
          </button>
          {!result.isPermanent && (
            <button
              onClick={handleKeepPermanently}
              disabled={promoting}
              className="w-full rounded-md bg-emerald-700 py-2 text-sm hover:bg-emerald-600 transition disabled:opacity-50"
            >
              {promoting ? "Saving…" : "Keep Permanently"}
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button onClick={reset} className="text-xs text-neutral-500 underline mt-2">
          Share another file
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm flex flex-col items-center gap-5">
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
        className={`w-full h-44 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition text-center px-4 ${
          dragActive ? "border-neutral-300 bg-neutral-900" : "border-neutral-700"
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
            <p className="text-sm text-neutral-400">{formatBytes(file.size)}</p>
          </>
        ) : (
          <>
            <p>Drop file here</p>
            <p className="text-sm text-neutral-400">or Browse</p>
          </>
        )}
      </div>

      <div className="w-full flex flex-col gap-3">
        <label className="flex items-center justify-between text-sm">
          Expiration
          <select
            value={expiresMinutes}
            onChange={(e) => setExpiresMinutes(Number(e.target.value))}
            className="bg-neutral-800 rounded-md px-3 py-1.5"
          >
            {ALLOWED_EXPIRATIONS_MINUTES.map((m) => (
              <option key={m} value={m}>
                {EXPIRATION_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center justify-between text-sm">
          Downloads
          <select
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(e.target.value === "" ? "" : Number(e.target.value))}
            className="bg-neutral-800 rounded-md px-3 py-1.5"
          >
            <option value="">Unlimited</option>
            {ALLOWED_MAX_DOWNLOADS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      <button
        onClick={handleUpload}
        disabled={!file || stage === "uploading"}
        className="w-full rounded-md bg-white text-black font-medium py-2.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-200 transition"
      >
        {stage === "uploading" ? "Uploading…" : "Upload"}
      </button>
    </div>
  );
}
