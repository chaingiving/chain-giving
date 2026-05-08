// Best-effort in-memory rate limiter. Per-instance only — across multi-instance
// deployments (e.g. Vercel Functions), each instance keeps its own counters, so
// the effective limit is `max * instances`. Acceptable for low-volume abuse
// resistance on session-bound endpoints; swap for a shared store (Vercel KV,
// Redis) if cross-instance accuracy is required.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= max) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { ok: true };
}
