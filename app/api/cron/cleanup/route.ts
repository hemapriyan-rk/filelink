import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { runCleanupSweep } from "@/lib/cleanup";

/**
 * Invoked by Vercel Cron (see vercel.json). Vercel automatically attaches
 * `Authorization: Bearer $CRON_SECRET` to cron-triggered requests when
 * CRON_SECRET is set as an env var, which we verify here so this endpoint
 * can't be triggered by anyone else to force-run cleanup or exhaust
 * Supabase quota.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runCleanupSweep();
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    console.error("cleanup sweep failed", err);
    return NextResponse.json({ error: "Cleanup sweep failed." }, { status: 500 });
  }
}
