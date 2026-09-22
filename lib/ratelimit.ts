/**
 * Best-effort, in-memory, fixed-window rate limiter.
 *
 * This is intentionally NOT backed by Redis or any shared store — the brief
 * for this project explicitly calls for avoiding infrastructure a personal
 * file-transfer tool doesn't need. The tradeoff: each serverless instance
 * has its own counters, so the effective limit is "per warm instance" rather
 * than a hard global cap, and it resets on cold start. For a low-traffic
 * personal app shared with friends, this is a reasonable speed bump against
 * accidental abuse/scripted spam, not a defense against a determined
 * distributed attacker — that is out of scope (see ARCHITECTURE.md threat
 * model).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
