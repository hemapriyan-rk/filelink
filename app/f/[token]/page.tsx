import { notFound } from "next/navigation";
import { lookupActiveFile } from "@/lib/queries";
import { hashToken } from "@/lib/token";
import { DownloadPanel } from "@/components/DownloadPanel";

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

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // A malformed/oversized token can never match a real row, so reject it
  // before touching the database.
  if (!token || token.length > 200) {
    notFound();
  }

  const file = await lookupActiveFile(hashToken(token));
  if (!file) {
    notFound();
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-6 text-center">
            <p className="font-display text-3xl tracking-wide">
              <span className="text-[var(--crate-red)]">CRATE</span> LINK
            </p>
          </div>

          <div className="tear-line mx-8" />

          <div className="px-6 sm:px-8 py-8">
            <div className="text-center mb-6">
              <p className="font-medium break-all">{file.original_filename}</p>
              <p className="text-sm text-[var(--ink-soft)] font-data">
                {formatBytes(file.size_bytes)}
              </p>
            </div>
            <DownloadPanel
              token={token}
              expiresAt={file.expires_at}
              isPermanent={file.is_permanent}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
