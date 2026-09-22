import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashToken } from "@/lib/token";
import { promoteToPermanent, updateStoragePath } from "@/lib/queries";
import { STORAGE_BUCKET } from "@/lib/constants";

/**
 * Promotes a temporary file to permanent.
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
 * will never delete it — it just stays reachable at its temp/ path until a
 * retry. No dangling-deletion risk either way.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length > 200) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
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
