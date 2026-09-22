/**
 * Live-Supabase tests for the escalating ban system (see lib/abuse.ts and
 * supabase/migrations/0002_abuse.sql). Skipped automatically without
 * configured credentials — same pattern as tests/integration/lifecycle.test.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkBan, recordStrike } from "@/lib/abuse";
import { STRIKE_THRESHOLD } from "@/lib/constants";

const hasEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// TEST-NET-3 (RFC 5737) — guaranteed not a real visitor's IP.
function testIp() {
  return `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
}

describe.skipIf(!hasEnv)("abuse ban escalation (live Supabase)", () => {
  const usedIps: string[] = [];

  afterEach(async () => {
    if (usedIps.length === 0) return;
    const admin = getSupabaseAdmin();
    await admin.from("abuse_ips").delete().in("ip", usedIps);
    usedIps.length = 0;
  });

  it("an IP with no strikes is not banned", async () => {
    const ip = testIp();
    usedIps.push(ip);
    const status = await checkBan(ip);
    expect(status.banned).toBe(false);
  });

  it("bans an IP once it reaches the strike threshold", async () => {
    const ip = testIp();
    usedIps.push(ip);

    let last;
    for (let i = 0; i < STRIKE_THRESHOLD; i++) {
      last = await recordStrike(ip);
    }

    expect(last?.banned).toBe(true);
    expect(last?.bannedUntil).not.toBeNull();

    const status = await checkBan(ip);
    expect(status.banned).toBe(true);
  });

  it("does not ban an IP that stays under the threshold", async () => {
    const ip = testIp();
    usedIps.push(ip);

    for (let i = 0; i < STRIKE_THRESHOLD - 1; i++) {
      await recordStrike(ip);
    }

    const status = await checkBan(ip);
    expect(status.banned).toBe(false);
  });

  it("escalates ban duration on repeat offenses", async () => {
    const ip = testIp();
    usedIps.push(ip);
    const admin = getSupabaseAdmin();

    let firstBanUntil: string | null = null;
    for (let i = 0; i < STRIKE_THRESHOLD; i++) {
      const r = await recordStrike(ip);
      if (r.banned) firstBanUntil = r.bannedUntil;
    }
    expect(firstBanUntil).not.toBeNull();
    const firstDurationMs = new Date(firstBanUntil!).getTime() - Date.now();

    // Manually clear the ban so we can trigger a second offense in the test
    // without waiting out the first ban — ban_count (the escalation driver)
    // is left untouched.
    await admin.from("abuse_ips").update({ banned_until: null }).eq("ip", ip);

    let secondBanUntil: string | null = null;
    for (let i = 0; i < STRIKE_THRESHOLD; i++) {
      const r = await recordStrike(ip);
      if (r.banned) secondBanUntil = r.bannedUntil;
    }
    expect(secondBanUntil).not.toBeNull();
    const secondDurationMs = new Date(secondBanUntil!).getTime() - Date.now();

    expect(secondDurationMs).toBeGreaterThan(firstDurationMs);
  });
});
