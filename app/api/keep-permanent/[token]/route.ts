import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashToken } from "@/lib/token";
import { promoteToPermanent, updateStoragePath } from "@/lib/queries";
import { checkBan, recordStrike } from "@/lib/abuse";
import { verifyTotp } from "@/lib/totp";
import { clientIpFrom } from "@/lib/ratelimit";
import { serverEnv } from "@/lib/env";
import { STORAGE_BUCKET } from "@/lib/constants";

/**
 * Promotes a temporary file to permanent. Admin-gated: requires a fresh,
 * valid admin TOTP code on every call, independent of whether the file
 * was originally uploaded with one — "keep permanently" is an admin
 * action full stop, not something the original uploader's choices alone
 * should unlock forever. Without this check, anyone with a share link
 * could have made any file permanent, which is a meaningfully different
 * (and unwanted) capability from just downloading it.
 *
 * Race safety (see ARCHITECTURE.md, Case B): promoteToPermanent's UPDATE
 * carries `is_permanent = false` and `expires_at > now()` in its WHERE
 * clause. Whichever of "this promote" or "a concurrent cleanup sweep
 * marking the row deleted" commits first wins; the other one's UPDATE
 * simply matches zero rows. There is no window where cleanup can delete a
 * file that has already been (or is concurrently being) promoted.
 *
 * The storage object is then moved from temp/ to perm/ on a best-effort
 * basis. If that move fails, the DB row is already is_permanent = true, so
 * the cleanup sweep (which only ever targets is_permanent = false rows)
 * will never delete it — it just stays reachable at its old path until a
 * retry. No dangling-deletion risk either way.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length > 200) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

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
    body = {};
  }
  const { adminCode } = (body ?? {}) as Record<string, unknown>;

  const secret = serverEnv.adminTotpSecret;
  const isAdmin =
    typeof adminCode === "string" && adminCode.trim().length > 0 && !!secret && verifyTotp(secret, adminCode);

  if (!isAdmin) {
    const strike = await recordStrike(ip);
    if (strike.banned) {
      return NextResponse.json(
        { error: "This IP has been temporarily banned for repeated abuse.", bannedUntil: strike.bannedUntil },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "A valid admin code is required for this." }, { status: 403 });
  }

  const tokenHash = hashToken(token);

  let promoted;
  try {
    promoted = await promoteToPermanent(tokenHash);
  } catch (err) {
    console.error("keep-permanent update failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  if (!promoted) {
    return NextResponse.json(
      { error: "This link is no longer available to modify." },
      { status: 404 }
    );
  }

  if (promoted.storagePath.startsWith("temp/")) {
    const newPath = promoted.storagePath.replace(/^temp\//, "perm/");
    const admin = getSupabaseAdmin();
    const { error: moveError } = await admin.storage
      .from(STORAGE_BUCKET)
      .move(promoted.storagePath, newPath);

    if (!moveError) {
      try {
        await updateStoragePath(promoted.id, newPath);
      } catch (err) {
        console.error("keep-permanent path update failed", err);
      }
    } else {
      console.error("keep-permanent storage move failed", moveError);
    }
  }

  return NextResponse.json({ success: true });
}
