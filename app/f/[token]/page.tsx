import { notFound } from "next/navigation";
import { lookupActiveFiles } from "@/lib/queries";
import { hashToken } from "@/lib/token";
import { DownloadPanel } from "@/components/DownloadPanel";
import { CrateFileList } from "@/components/CrateFileList";

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

  const files = await lookupActiveFiles(hashToken(token));
  if (files.length === 0) {
    notFound();
  }

  // A "crate" (ARCHITECTURE.md §22): several files sharing one token,
  // browsed and downloaded individually. The overwhelmingly common case —
  // one file, one link — renders exactly as before.
  const isCrate = files.length > 1;
  const first = files[0];
  const isAdminUpload = files.some((f) => f.is_admin_upload);

  return (
    <main className="min-h-svh flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div
          className={`glass-panel rounded-2xl overflow-hidden ${
            isAdminUpload ? "outline outline-2 outline-[var(--crate-red)]" : ""
          }`}
        >
          <div className="px-8 sm:px-12 pt-8 pb-5 text-center">
            <p className="font-display text-4xl tracking-wide">
              <span className="text-[var(--crate-red)]">CRATE</span> LINK
            </p>
            {isAdminUpload && (
              <p className="mt-2 text-[10px] font-data tracking-wide inline-block rounded-full bg-[var(--crate-red)] text-white px-2.5 py-0.5">
                ADMIN UPLOAD
              </p>
            )}
          </div>

          <div className="tear-line mx-10" />

          <div className="px-8 sm:px-12 py-10">
            {isCrate ? (
              <>
                <p className="text-center text-sm text-[var(--ink-soft)] mb-4">
                  {files.length} files in this crate
                </p>
                <CrateFileList
                  token={token}
                  files={files.map((f) => ({
                    id: f.id,
                    filename: f.original_filename,
                    sizeBytes: f.size_bytes,
                  }))}
                  expiresAt={first.expires_at}
                  isPermanent={first.is_permanent}
                />
              </>
            ) : (
              <>
                <div className="text-center mb-6 max-w-xs mx-auto">
                  <p className="font-medium break-all">{first.original_filename}</p>
                  <p className="text-sm text-[var(--ink-soft)] font-data">
                    {formatBytes(first.size_bytes)}
                  </p>
                </div>
                <div className="max-w-xs mx-auto">
                  <DownloadPanel
                    token={token}
                    fileId={first.id}
                    expiresAt={first.expires_at}
                    isPermanent={first.is_permanent}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
