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
    <main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">DROPLINK</h1>
      <div>
        <p className="font-medium break-all">{file.original_filename}</p>
        <p className="text-sm text-neutral-400">{formatBytes(file.size_bytes)}</p>
      </div>
      <DownloadPanel token={token} expiresAt={file.expires_at} isPermanent={file.is_permanent} />
    </main>
  );
}
