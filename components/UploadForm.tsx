"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { generateQrDataUrl } from "@/lib/qr";
import {
  ALLOWED_EXPIRATIONS_MINUTES,
  ALLOWED_MAX_DOWNLOADS,
  EXPIRATION_LABELS,
  MAX_DOWNLOADS_LIMIT,
  MAX_FILES_PER_BATCH,
  MAX_FILE_SIZE_BYTES,
  MIN_DOWNLOADS_LIMIT,
  MIN_EXPIRATION_MINUTES,
  NEAR_FULL_EXPIRATION_MINUTES,
  STORAGE_BUCKET,
} from "@/lib/constants";
import { hasConsent } from "@/lib/consent";
import { zipFiles } from "@/lib/zip";
import { addToHistory } from "@/lib/history";
import { CountdownTimer } from "./CountdownTimer";
import { StatsToggle } from "./StatsToggle";

type Stage = "idle" | "choosing" | "uploading" | "ready" | "banned";
const CUSTOM = "custom" as const;
const CONCURRENCY = 3;
const SESSION_KEY = "cratelink:lastResults";

interface Capacity {
  status: "ok" | "near_full" | "full";
}

type CustomUnit = "minutes" | "hours" | "days";

const UNIT_MINUTES: Record<CustomUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

interface FileResult {
  shareUrl: string;
  publicToken: string;
  filename: string;
  expiresAt: string | null;
  isPermanent: boolean;
}

type QueueStatus = "queued" | "uploading" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  error?: string;
  result?: FileResult;
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

function ResultRow({ result }: { result: FileResult }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [permanent, setPermanent] = useState(result.isPermanent);
  const [expiresAt, setExpiresAt] = useState(result.expiresAt);

  async function toggleQr() {
    if (!showQr && !qrDataUrl) {
      setQrDataUrl(await generateQrDataUrl(result.shareUrl));
    }
    setShowQr((v) => !v);
  }

  async function downloadQr() {
    const url = qrDataUrl ?? (await generateQrDataUrl(result.shareUrl));
    if (!qrDataUrl) setQrDataUrl(url);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cratelink-qr-${result.filename}.png`;
    a.click();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(result.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // non-fatal
    }
  }

  async function keepPermanently() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/keep-permanent/${result.publicToken}`, { method: "POST" });
      if (res.ok) {
        setPermanent(true);
        setExpiresAt(null);
      }
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="border border-[var(--line)] rounded-lg p-4 bg-white/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm break-all">{result.filename}</p>
          <CountdownTimer expiresAt={expiresAt} isPermanent={permanent} />
        </div>
      </div>

      {showQr && qrDataUrl && (
        <div className="mt-3 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`QR code for ${result.filename}`}
            width={140}
            height={140}
            className="rounded bg-white p-2 border border-[var(--line)]"
          />
        </div>
      )}

      <p className="font-data text-xs text-[var(--ink-soft)] break-all mt-2">{result.shareUrl}</p>

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          onClick={copyLink}
          className="rounded-md border border-[var(--crate-red)] text-[var(--crate-red)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--crate-red)] hover:text-white transition-colors"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={toggleQr}
          className="rounded-md border border-[var(--crate-red)] text-[var(--crate-red)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--crate-red)] hover:text-white transition-colors"
        >
          {showQr ? "Hide QR" : "Show QR"}
        </button>
        <button
          onClick={downloadQr}
          className="rounded-md border border-[var(--crate-red)] text-[var(--crate-red)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--crate-red)] hover:text-white transition-colors"
        >
          Save QR
        </button>
        {!permanent && (
          <button
            onClick={keepPermanently}
            disabled={promoting}
            className="rounded-md bg-[var(--crate-red)] text-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--crate-red-deep)] transition-colors disabled:opacity-50"
          >
            {promoting ? "Saving…" : "Keep permanently"}
          </button>
        )}
      </div>

      <div className="mt-3">
        <StatsToggle token={result.publicToken} />
      </div>
    </div>
  );
}

export function UploadForm() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [expirationChoice, setExpirationChoice] = useState<string>(String(ALLOWED_EXPIRATIONS_MINUTES[1]));
  const [customAmount, setCustomAmount] = useState<number>(2);
  const [customUnit, setCustomUnit] = useState<CustomUnit>("hours");
  const [downloadsChoice, setDownloadsChoice] = useState<string>("");
  const [customDownloads, setCustomDownloads] = useState<number>(20);
  const [showAdminField, setShowAdminField] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bannedUntil, setBannedUntil] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetch("/api/capacity")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCapacity(data);
      })
      .catch(() => {
        // capacity check failing shouldn't block the form — /api/upload/init
        // enforces the real limit server-side regardless.
      });
  }, []);

  useEffect(() => {
    // capacity arrives asynchronously from /api/capacity, so there's no way
    // to compute this as initial state — it has to react to the fetch
    // resolving.
    if (capacity?.status === "near_full") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpirationChoice(String(NEAR_FULL_EXPIRATION_MINUTES));
    }
  }, [capacity]);

  // Restore the last batch's results if the visitor consented and it hasn't
  // expired — so switching tabs, or an accidental refresh, doesn't lose a
  // link/QR they haven't copied yet. Nothing is written unless consent was
  // given (see components/ConsentBanner.tsx); this reads sessionStorage
  // only, never a real HTTP cookie sent to the server.
  useEffect(() => {
    if (!hasConsent()) return;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved: FileResult[] = JSON.parse(raw);
      const stillValid = saved.filter(
        (r) => r.isPermanent || (r.expiresAt && new Date(r.expiresAt).getTime() > Date.now())
      );
      if (stillValid.length === 0) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      // sessionStorage is browser-only and unavailable during SSR, so this
      // restore can only happen after mount — an effect is the right tool.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQueue(
        stillValid.map((r) => ({
          id: r.publicToken,
          file: new File([], r.filename),
          status: "done" as const,
          result: r,
        }))
      );
      setStage("ready");
    } catch {
      // corrupt/unavailable storage is non-fatal — just skip restore
    }
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(null);
    const incomingArr = Array.from(incoming);
    setQueue((prev) => {
      const room = MAX_FILES_PER_BATCH - prev.length;
      if (room <= 0) {
        setError(`You can send at most ${MAX_FILES_PER_BATCH} files at once.`);
        return prev;
      }
      const oversized = incomingArr.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
      const accepted = incomingArr
        .filter((f) => f.size <= MAX_FILE_SIZE_BYTES)
        .slice(0, room);

      if (oversized.length > 0) {
        setError(
          `${oversized.length} file${oversized.length > 1 ? "s exceed" : " exceeds"} the ${Math.floor(
            MAX_FILE_SIZE_BYTES / (1024 * 1024)
          )} MB limit and ${oversized.length > 1 ? "were" : "was"} skipped. Use an admin code for larger files.`
        );
      } else if (incomingArr.length > room) {
        setError(`Only ${room} more file${room === 1 ? "" : "s"} could be added (${MAX_FILES_PER_BATCH} max).`);
      }

      return [
        ...prev,
        ...accepted.map((file) => ({
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          file,
          status: "queued" as const,
        })),
      ];
    });
  }, []);

  function removeFile(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  function resolveExpiresMinutes(): number | null {
    if (expirationChoice !== CUSTOM) return Number(expirationChoice);
    const raw = Math.round(customAmount * UNIT_MINUTES[customUnit]);
    if (!Number.isFinite(raw) || raw < MIN_EXPIRATION_MINUTES) return null;
    return raw;
  }

  /** null = unlimited (valid); undefined = an invalid custom value was entered. */
  function resolveMaxDownloads(): number | null | undefined {
    if (downloadsChoice === "") return null;
    if (downloadsChoice !== CUSTOM) return Number(downloadsChoice);
    if (
      !Number.isFinite(customDownloads) ||
      !Number.isInteger(customDownloads) ||
      customDownloads < MIN_DOWNLOADS_LIMIT ||
      customDownloads > MAX_DOWNLOADS_LIMIT
    ) {
      return undefined;
    }
    return customDownloads;
  }

  async function uploadOne(
    item: QueueItem,
    expiresMinutes: number,
    maxDownloads: number | null
  ): Promise<QueueItem> {
    try {
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: item.file.name,
          mimeType: item.file.type || "application/octet-stream",
          sizeBytes: item.file.size,
          expiresMinutes,
          maxDownloads,
          adminCode: adminCode.trim() || undefined,
        }),
      });

      if (initRes.status === 403) {
        const body = await initRes.json().catch(() => ({}));
        if (body.bannedUntil) {
          throw Object.assign(new Error("banned"), { bannedUntil: body.bannedUntil });
        }
        throw new Error(body.error || "Request rejected.");
      }

      if (!initRes.ok) {
        const body = await initRes.json().catch(() => ({}));
        throw new Error(body.error || "Could not start upload.");
      }

      const init = await initRes.json();

      const supabase = getSupabaseBrowser();
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .uploadToSignedUrl(init.storagePath, init.signedToken, item.file, {
          contentType: item.file.type || "application/octet-stream",
        });
      if (uploadError) throw new Error("Upload failed.");

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

      return {
        ...item,
        status: "done",
        result: {
          shareUrl: init.shareUrl,
          publicToken: init.publicToken,
          filename: item.file.name,
          expiresAt: confirmed.expiresAt,
          isPermanent: false,
        },
      };
    } catch (err) {
      if (err instanceof Error && "bannedUntil" in err) throw err;
      return {
        ...item,
        status: "error",
        error: err instanceof Error ? err.message : "Something went wrong.",
      };
    }
  }

  function saveResults(results: FileResult[]) {
    if (!hasConsent() || results.length === 0) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(results));
    } catch {
      // storage unavailable — non-fatal
    }
    addToHistory(results.map((r) => ({ ...r, createdAt: new Date().toISOString() })));
  }

  async function handleZipUpload(expiresMinutes: number, maxDownloads: number | null) {
    setZipProgress(0);
    let zipBlob: Blob;
    try {
      zipBlob = await zipFiles(
        queue.map((q) => ({ name: q.file.name, file: q.file })),
        (fraction) => setZipProgress(fraction)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the zip file.");
      setZipProgress(null);
      setStage("idle");
      return;
    }
    setZipProgress(null);

    const zipName = `crate-${new Date().toISOString().slice(0, 10)}-${queue.length}-files.zip`;
    const zipFile = new File([zipBlob], zipName, { type: "application/zip" });
    const zipItem: QueueItem = { id: "zip-bundle", file: zipFile, status: "uploading" };
    setQueue([zipItem]);

    let done: QueueItem;
    try {
      done = await uploadOne(zipItem, expiresMinutes, maxDownloads);
    } catch (err) {
      const banned = (err as { bannedUntil?: string }).bannedUntil ?? null;
      setBannedUntil(banned);
      setStage("banned");
      return;
    }
    setQueue([done]);

    if (done.status === "done" && done.result) saveResults([done.result]);
    setStage("ready");
  }

  async function proceedUpload(asZip: boolean) {
    const resolvedExpires = resolveExpiresMinutes();
    const resolvedDownloads = resolveMaxDownloads();
    if (resolvedExpires === null || resolvedDownloads === undefined) {
      // Already validated in handleUpload before reaching "choosing"; this
      // is just type narrowing back to non-null for TypeScript.
      setStage("idle");
      return;
    }
    const expiresMinutes: number = resolvedExpires;
    const maxDownloads: number | null = resolvedDownloads;

    setStage("uploading");

    if (asZip) {
      await handleZipUpload(expiresMinutes, maxDownloads);
      return;
    }

    setQueue((prev) => prev.map((q) => ({ ...q, status: "uploading" as const })));

    const pending = [...queue];
    const results: QueueItem[] = [];
    let cursor = 0;
    let hitBan = false;

    async function worker() {
      while (cursor < pending.length && !hitBan) {
        const idx = cursor++;
        try {
          const done = await uploadOne(pending[idx], expiresMinutes, maxDownloads);
          results[idx] = done;
          setQueue((prev) => prev.map((q) => (q.id === done.id ? done : q)));
        } catch (err) {
          hitBan = true;
          const banned = (err as { bannedUntil?: string }).bannedUntil ?? null;
          setBannedUntil(banned);
          setStage("banned");
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

    if (hitBan) return;

    const finalResults = results.filter((r): r is QueueItem => !!r && r.status === "done");
    saveResults(finalResults.map((r) => r.result!));

    setStage("ready");
  }

  function handleUpload() {
    if (queue.length === 0) return;
    if (resolveExpiresMinutes() === null) {
      setError("Enter a valid custom expiration.");
      return;
    }
    if (resolveMaxDownloads() === undefined) {
      setError("Enter a valid custom download limit.");
      return;
    }
    setError(null);

    if (queue.length > 1) {
      setStage("choosing");
      return;
    }

    proceedUpload(false);
  }

  function reset() {
    setQueue([]);
    setStage("idle");
    setError(null);
    setZipProgress(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }

  if (stage === "banned") {
    const until = bannedUntil ? new Date(bannedUntil).toLocaleString() : null;
    return (
      <div className="text-center py-4">
        <p className="font-display text-2xl text-[var(--crate-red)]">TEMPORARILY BLOCKED</p>
        <p className="text-sm text-[var(--ink-soft)] mt-2">
          This connection has been temporarily banned for repeated abuse of upload limits.
          {until ? ` You can try again after ${until}.` : ""}
        </p>
      </div>
    );
  }

  if (stage === "choosing") {
    return (
      <div className="text-center py-2 flex flex-col gap-4">
        <p className="font-display text-2xl text-[var(--crate-red)]">HOW TO SEND?</p>
        <p className="text-sm text-[var(--ink-soft)]">{queue.length} files selected.</p>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => proceedUpload(true)}
            className="w-full rounded-md bg-[var(--crate-red)] text-white font-medium py-3 hover:bg-[var(--crate-red-deep)] transition-colors"
          >
            One QR code (bundle as .zip)
          </button>
          <button
            onClick={() => proceedUpload(false)}
            className="w-full rounded-md border border-[var(--crate-red)] text-[var(--crate-red)] font-medium py-3 hover:bg-[var(--crate-red)] hover:text-white transition-colors"
          >
            Separate links ({queue.length} QR codes)
          </button>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          Bundling compresses everything into one file — great for text, won&apos;t shrink photos
          or video much, and the recipient has to unzip it.
        </p>
        <button onClick={() => setStage("idle")} className="text-xs text-[var(--ink-soft)] underline">
          Back
        </button>
      </div>
    );
  }

  if (capacity?.status === "full" && stage === "idle") {
    return (
      <div className="text-center py-4">
        <p className="font-display text-2xl text-[var(--crate-red)]">SERVER FULL</p>
        <p className="text-sm text-[var(--ink-soft)] mt-2">
          Crate Link is out of storage space right now. Files expire and get cleaned up
          automatically over time, freeing up room — please check back in a while.
        </p>
      </div>
    );
  }

  if (stage === "ready") {
    const done = queue.filter((q) => q.status === "done" && q.result);
    const failed = queue.filter((q) => q.status === "error");
    return (
      <div className="flex flex-col gap-4">
        <p className="font-display text-2xl text-[var(--crate-red)] text-center">
          {done.length > 1 ? "PARCELS READY" : "PARCEL READY"}
        </p>

        <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
          {done.map((item) => (
            <ResultRow key={item.id} result={item.result!} />
          ))}
        </div>

        {failed.length > 0 && (
          <div className="text-center">
            <p className="text-sm text-[var(--crate-red)]">
              {failed.length} file{failed.length > 1 ? "s" : ""} failed to send:
            </p>
            {failed.map((item) => (
              <p key={item.id} className="text-xs text-[var(--ink-soft)]">
                {item.file.name} — {item.error}
              </p>
            ))}
          </div>
        )}

        <button onClick={reset} className="text-xs text-[var(--ink-soft)] underline text-center mt-1">
          Send more files
        </button>
      </div>
    );
  }

  const uploading = stage === "uploading";

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`h-36 sm:h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors text-center px-4 ${
          dragActive
            ? "border-[var(--crate-red)] bg-[var(--crate-red)]/5"
            : "border-[var(--ink)]/25 hover:border-[var(--crate-red)]/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="font-medium">Drop files here</p>
        <p className="text-sm text-[var(--ink-soft)]">
          or tap to browse · up to {MAX_FILES_PER_BATCH} files
        </p>
      </div>

      {queue.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
          {queue.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 text-sm border border-[var(--line)] rounded-md px-3 py-1.5 bg-white/60"
            >
              <span className="truncate">{item.file.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-[var(--ink-soft)] font-data">
                  {formatBytes(item.file.size)}
                </span>
                {!uploading && (
                  <button
                    onClick={() => removeFile(item.id)}
                    aria-label={`Remove ${item.file.name}`}
                    className="text-[var(--ink-soft)] hover:text-[var(--crate-red)]"
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {zipProgress !== null && (
        <div>
          <div className="h-1.5 rounded-full bg-[var(--line)] overflow-hidden">
            <div
              className="h-full bg-[var(--crate-red)] transition-all"
              style={{ width: `${Math.round(zipProgress * 100)}%` }}
            />
          </div>
          <p className="text-xs text-[var(--ink-soft)] mt-1">
            Compressing… {Math.round(zipProgress * 100)}%
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <div className="text-sm mb-1.5">Expires</div>
          {capacity?.status === "near_full" ? (
            <>
              <div className="w-full bg-[var(--line)]/40 border border-[var(--line)] rounded-md px-3 py-2 text-sm text-[var(--ink-soft)]">
                10 minutes (fixed)
              </div>
              <p className="text-xs text-[var(--crate-red)] mt-1.5">
                We&apos;re low on storage space, so only the shortest expiration is available
                right now. Check back later for longer durations.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        <div>
          <div className="text-sm mb-1.5">Downloads</div>
          <select
            value={downloadsChoice}
            onChange={(e) => setDownloadsChoice(e.target.value)}
            className="w-full bg-white border border-[var(--line)] rounded-md px-3 py-2 text-sm"
          >
            <option value="">Unlimited</option>
            {ALLOWED_MAX_DOWNLOADS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={CUSTOM}>Custom…</option>
          </select>

          {downloadsChoice === CUSTOM && (
            <input
              type="number"
              min={MIN_DOWNLOADS_LIMIT}
              max={MAX_DOWNLOADS_LIMIT}
              value={customDownloads}
              onChange={(e) => setCustomDownloads(Number(e.target.value))}
              className="mt-2 w-full bg-white border border-[var(--line)] rounded-md px-3 py-2 text-sm font-data"
            />
          )}
        </div>

        <div>
          {showAdminField ? (
            <div>
              <div className="text-sm mb-1.5">Admin code</div>
              <input
                type="text"
                inputMode="numeric"
                placeholder="6-digit code"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                className="w-full bg-white border border-[var(--line)] rounded-md px-3 py-2 text-sm font-data"
              />
              <p className="text-xs text-[var(--ink-soft)] mt-1">
                Unlocks larger files and longer expiration for this batch.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdminField(true)}
              className="text-xs text-[var(--ink-soft)] underline"
            >
              Have an admin code?
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-[var(--crate-red)] text-center">{error}</p>}

      <button
        onClick={handleUpload}
        disabled={queue.length === 0 || uploading}
        className="w-full rounded-md bg-[var(--crate-red)] text-white font-medium py-3 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--crate-red-deep)] transition-colors"
      >
        {uploading
          ? zipProgress !== null
            ? "Compressing…"
            : "Shipping…"
          : queue.length > 1
            ? `Ship ${queue.length} files`
            : "Ship it"}
      </button>
    </div>
  );
}
