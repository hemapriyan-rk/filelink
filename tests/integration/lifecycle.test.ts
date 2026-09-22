/**
 * End-to-end lifecycle tests against a REAL Supabase project (not mocked).
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set
 * (see .env.example), the migration in supabase/migrations to be applied,
 * and a "droplink" storage bucket to exist. The whole suite is skipped
 * automatically if those aren't configured, so `npm test` still passes in
 * an environment with only the unit tests available.
 *
 * These tests create and clean up their own rows/objects; they do not
 * assume an empty table.
 */
import { afterAll, describe, expect, it } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generatePublicToken, generateStorageKey, hashToken } from "@/lib/token";
import { consumeDownload, lookupActiveFile, promoteToPermanent } from "@/lib/queries";
import { runCleanupSweep } from "@/lib/cleanup";
import { STORAGE_BUCKET } from "@/lib/constants";

const hasEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const createdIds: string[] = [];
const createdPaths: string[] = [];

async function insertFile(overrides: Record<string, unknown> = {}) {
  const admin = getSupabaseAdmin();
  const publicToken = generatePublicToken();
  const tokenHash = hashToken(publicToken);
  const storagePath = `temp/${generateStorageKey()}`;

  const { data, error } = await admin
    .from("files")
    .insert({
      token_hash: tokenHash,
      storage_path: storagePath,
      original_filename: "test.txt",
      mime_type: "text/plain",
      size_bytes: 11,
      status: "active",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      ...overrides,
    })
    .select("id, storage_path")
    .single();

  if (error) throw error;
  createdIds.push(data.id);
  createdPaths.push(data.storage_path);

  const { error: uploadErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(data.storage_path, Buffer.from("hello world"), {
      contentType: "text/plain",
      upsert: true,
    });
  if (uploadErr) throw uploadErr;

  return { publicToken, tokenHash, id: data.id as string, storagePath: data.storage_path as string };
}

/**
 * Runs the cleanup sweep, retrying briefly if the target row wasn't caught
 * the first time. Supabase's data API can have a brief (sub-second)
 * read-after-write lag under rapid successive requests, which only shows up
 * here because the test inserts a row and sweeps for it immediately — in
 * production the cron runs minutes/hours after a file is created, long past
 * any such lag. This retry mirrors what already makes the cleanup design
 * itself correct: a sweep that misses a candidate is safe and idempotent,
 * simply catching it on a later run (see ARCHITECTURE.md, Case D/E).
 */
async function sweepUntilCaught(fileId: string, attempts = 5): Promise<void> {
  const admin = getSupabaseAdmin();
  for (let i = 0; i < attempts; i++) {
    await runCleanupSweep();
    const { data } = await admin.from("files").select("status").eq("id", fileId).single();
    if (data?.status === "deleted") return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

describe.skipIf(!hasEnv)("Droplink lifecycle (live Supabase)", () => {
  afterAll(async () => {
    const admin = getSupabaseAdmin();
    if (createdPaths.length) await admin.storage.from(STORAGE_BUCKET).remove(createdPaths);
    if (createdIds.length) await admin.from("files").delete().in("id", createdIds);
  });

  it("upload -> record active -> resolvable by token", async () => {
    const { tokenHash } = await insertFile();
    const found = await lookupActiveFile(tokenHash);
    expect(found).not.toBeNull();
    expect(found?.original_filename).toBe("test.txt");
  });

  it("valid token can be downloaded", async () => {
    const { tokenHash } = await insertFile();
    const consumed = await consumeDownload(tokenHash);
    expect(consumed).not.toBeNull();
    expect(consumed?.download_count).toBe(1);
  });

  it("a random, never-issued token is rejected", async () => {
    const fakeHash = hashToken(generatePublicToken());
    expect(await lookupActiveFile(fakeHash)).toBeNull();
    expect(await consumeDownload(fakeHash)).toBeNull();
  });

  it("an expired token is rejected for both lookup and download", async () => {
    const { tokenHash } = await insertFile({
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(await lookupActiveFile(tokenHash)).toBeNull();
    expect(await consumeDownload(tokenHash)).toBeNull();
  });

  it("enforces max_downloads = 1: exactly one of two concurrent downloads succeeds", async () => {
    const { tokenHash } = await insertFile({ max_downloads: 1, download_count: 0 });

    const [a, b] = await Promise.all([consumeDownload(tokenHash), consumeDownload(tokenHash)]);
    const successes = [a, b].filter((r) => r !== null);
    expect(successes).toHaveLength(1);

    // A third attempt after the limit is reached must also fail.
    expect(await consumeDownload(tokenHash)).toBeNull();
  });

  it("keep permanently: file survives a cleanup sweep after promotion", async () => {
    const { tokenHash, id, storagePath } = await insertFile({
      expires_at: new Date(Date.now() + 5_000).toISOString(),
    });

    const promoted = await promoteToPermanent(tokenHash);
    expect(promoted).not.toBeNull();
    if (promoted && promoted.storagePath !== storagePath) {
      createdPaths.push(promoted.storagePath);
    }

    await runCleanupSweep();

    const admin = getSupabaseAdmin();
    const { data } = await admin.from("files").select("status, is_permanent").eq("id", id).single();
    expect(data?.status).toBe("active");
    expect(data?.is_permanent).toBe(true);
  });

  it("cleanup sweep deletes an expired temporary file's storage object and marks it deleted", async () => {
    const { id, storagePath } = await insertFile({
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    await sweepUntilCaught(id);

    const admin = getSupabaseAdmin();
    const { data: row } = await admin.from("files").select("status").eq("id", id).single();
    expect(row?.status).toBe("deleted");

    const folder = storagePath.slice(0, storagePath.lastIndexOf("/"));
    const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
    const { data: listing } = await admin.storage.from(STORAGE_BUCKET).list(folder, { search: name });
    expect(listing?.some((e) => e.name === name)).toBe(false);
  });

  it("cleanup sweep is idempotent: running it twice is safe", async () => {
    const { id } = await insertFile({ expires_at: new Date(Date.now() - 1000).toISOString() });
    await sweepUntilCaught(id);
    // A second sweep after the row is already deleted must be a safe no-op.
    await expect(runCleanupSweep()).resolves.toBeDefined();
    const admin = getSupabaseAdmin();
    const { data: row } = await admin.from("files").select("status").eq("id", id).single();
    expect(row?.status).toBe("deleted");
  });
});
