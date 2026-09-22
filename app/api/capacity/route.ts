import { NextResponse } from "next/server";
import { getCapacity } from "@/lib/capacity";

/**
 * Public, read-only. The upload form polls this before letting someone
 * configure an upload, so the UI can restrict options (or block uploads
 * entirely) proactively rather than only finding out after picking files
 * and clicking Ship — /api/upload/init enforces the same check
 * server-side regardless, this is purely so the UI can be honest upfront.
 */
export async function GET() {
  const capacity = await getCapacity();
  return NextResponse.json(capacity);
}
