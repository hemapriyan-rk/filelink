import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashToken } from "@/lib/token";
import { checkBan } from "@/lib/abuse";
import { clientIpFrom } from "@/lib/ratelimit";
import { EXPIRATION_START_BUFFER_SECONDS } from "@/lib/constants";

/**
 * Called once by the client after every file in a crate (see
 * ARCHITECTURE.md §22) has individually confirmed. Each file's own
 * /api/upload/confirm call already gave it a working expires_at, but those
 * land at slightly different moments — whichever file finishes uploading
 * first confirms first. For a crate, that's wrong: the countdown shown to
 * the recipient is one shared timer, and it should reflect when the whole
 * crate (every file, then the QR code) was actually ready, not when the
 * fastest individual file happened to finish.
 *
 * This re-syncs every row sharing the token to one expires_at, computed
 * from now (the true "everything's ready" moment) using the group's own
 * already-validated expiration_minutes — never trusting a duration from
 * the request body. If this call never happens (client crash, network
 * failure), the crate still works: each file just keeps the slightly
 * earlier expires_at its own confirm already gave it, a harmless
 * degradation rather than a broken state.
 */
export async function POST(req: NextRequest) {
  const ip = clientIpFrom(req.headers);
  const ban = await checkBan(ip);
  if (ban.banned) {
    return NextResponse.json(
      { error: "This IP has been temporarily banned for repeated abuse.", bannedUntil: ban.bannedUntil },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { groupToken } = (body ?? {}) as Record<string, unknown>;
  if (typeof groupToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(groupToken)) {
    return NextResponse.json({ error: "Invalid group token." }, { status: 400 });
  }
  const tokenHash = hashToken(groupToken);

  const admin = getSupabaseAdmin();
  const { data: rows, error } = await admin
    .from("files")
    .select("id, expiration_minutes")
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .eq("is_permanent", false);

  if (error) {
    console.error("upload/group-finalize lookup failed", error);
    return NextResponse.json({ error: "Could not finalize crate." }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "This crate is no longer available." }, { status: 404 });
  }

  const expirationMinutes = Math.max(...rows.map((r) => r.expiration_minutes ?? 0));
  const expiresAt = new Date(
    Date.now() + expirationMinutes * 60 * 1000 + EXPIRATION_START_BUFFER_SECONDS * 1000
  ).toISOString();

  const { error: updateError } = await admin
    .from("files")
    .update({ expires_at: expiresAt })
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .eq("is_permanent", false);

  if (updateError) {
    console.error("upload/group-finalize update failed", updateError);
    return NextResponse.json({ error: "Could not finalize crate." }, { status: 500 });
  }

  return NextResponse.json({ success: true, expiresAt, count: rows.length });
}
