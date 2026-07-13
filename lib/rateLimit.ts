type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

/**
 * Simple in-memory fixed-window rate limiter, keyed by caller-provided string
 * (e.g. `${route}:${userId}`). Good enough for a single-process app with a
 * small user base; resets on server restart and isn't shared across instances.
 *
 * On a serverless host (this app deploys to Vercel), that last point matters
 * more than it sounds: concurrent requests can land on separate, memory-isolated
 * instances, each with its own empty `buckets` map. A caller who fires requests
 * in parallel can effectively get `limit x (number of instances they hit)`
 * rather than `limit` - this is a best-effort speed bump against naive/serial
 * abuse, not a hard guarantee, and shouldn't be relied on as the sole defense
 * for anything security-sensitive. A durable shared store (e.g. Upstash Redis)
 * would close this gap but adds a network round-trip to every gated request
 * and a new external dependency - deliberately not adopted here for now.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
