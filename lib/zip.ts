"use client";

import { Zip, AsyncZipDeflate } from "fflate";

/**
 * Bundles multiple files into a single ZIP blob, streaming each file's
 * bytes straight into the compressor a chunk at a time via fflate's
 * streaming API — this never holds a whole file's raw bytes in memory
 * alongside its compressed copy, which matters once batches start
 * approaching the multi-GB range this app allows with an admin code.
 * Compression runs off the main thread (fflate uses a Web Worker for
 * AsyncZipDeflate automatically) so the tab doesn't freeze mid-zip.
 *
 * This exists for two reasons at once: it's how "save space" for a
 * multi-file batch actually gets implemented (compression helps a lot for
 * text/uncompressed formats, negligibly for already-compressed ones like
 * photos or video — that's an honest limit of zipping, not this
 * implementation), and it's also how this app gets a single link for
 * multiple files without any schema change — the zip just goes through
 * the exact same single-file upload pipeline as anything else.
 */
export async function zipFiles(
  files: { name: string; file: File }[],
  onProgress?: (fraction: number) => void
): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  let doneSize = 0;

  return new Promise((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) {
        reject(err);
        return;
      }
      if (chunk) chunks.push(chunk);
      if (final) {
        // fflate types each chunk as Uint8Array<ArrayBufferLike> (covering the
        // theoretical SharedArrayBuffer case), but Blob's constructor wants
        // ArrayBuffer specifically — these are always plain ArrayBuffer-backed
        // in practice, so this cast just reconciles the two DOM type strictness
        // levels, not a real runtime distinction.
        resolve(new Blob(chunks as BlobPart[], { type: "application/zip" }));
      }
    });

    (async () => {
      for (const { name, file } of files) {
        const entry = new AsyncZipDeflate(name, { level: 6 });
        zip.add(entry);
        const reader = file.stream().getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            entry.push(new Uint8Array(0), true);
            break;
          }
          doneSize += value.byteLength;
          onProgress?.(totalSize > 0 ? doneSize / totalSize : 1);
          entry.push(value, false);
        }
      }
      zip.end();
    })().catch(reject);
  });
}
