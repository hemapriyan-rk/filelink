"use client";

import { clientEnv } from "./env";

/**
 * Uploads a file to a Supabase signed-upload URL with real progress
 * events, for the "this might take a while" indicator on larger files.
 * The Supabase JS SDK's own `uploadToSignedUrl` wraps `fetch`, which has
 * no upload-progress API in browsers — this replicates the exact same
 * request shape (a PUT with the file in a FormData body, `cacheControl`
 * field, `apikey` + `x-upsert` headers) via XMLHttpRequest specifically
 * so `xhr.upload.onprogress` is available. Verified to produce identical,
 * successfully-downloadable uploads to the SDK's own method.
 */
export function uploadFileWithProgress(
  signedUrl: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("apikey", clientEnv.supabaseAnonKey);
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (status ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}
