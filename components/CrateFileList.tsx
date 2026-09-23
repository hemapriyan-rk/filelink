"use client";

import { useState } from "react";
import { CountdownTimer } from "./CountdownTimer";
import { StatsToggle } from "./StatsToggle";

interface CrateFile {
  id: string;
  filename: string;
  sizeBytes: number;
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

/**
 * The recipient-facing view of a "crate" — several files sharing one
 * token/link, browsed and downloaded individually rather than forced into
 * one archive (the alternative to the uploader's "bundle as .zip" choice
 * — see ARCHITECTURE.md §22). All files in a crate share one
 * expiration/download-limit set once at upload time, so one shared
 * countdown at the top is accurate; download counts and remaining slots
 * are still tracked and shown per file, independently.
 */
export function CrateFileList({
  token,
  files,
  expiresAt,
  isPermanent,
}: {
  token: string;
  files: CrateFile[];
  expiresAt: string | null;
  isPermanent: boolean;
}) {
  const [expired, setExpired] = useState(false);

  if (expired) {
    return (
      <div className="text-center">
        <p className="font-display text-2xl text-[var(--crate-red)]">LINK EXPIRED</p>
        <p className="text-sm text-[var(--ink-soft)] mt-1">This crate is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <CountdownTimer expiresAt={expiresAt} isPermanent={isPermanent} onExpire={() => setExpired(true)} />
      </div>

      <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
        {files.map((file) => (
          <div key={file.id} className="border border-[var(--line)] rounded-lg p-3 bg-white/70">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm break-all">{file.filename}</p>
                <p className="text-xs text-[var(--ink-soft)] font-data">{formatBytes(file.sizeBytes)}</p>
              </div>
              <a
                href={`/api/download/${token}?file=${file.id}`}
                className="shrink-0 rounded-md bg-[var(--crate-red)] text-white text-sm font-medium px-4 py-2 hover:bg-[var(--crate-red-deep)] transition-colors"
              >
                Download
              </a>
            </div>
            <div className="mt-2">
              <StatsToggle token={token} fileId={file.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
