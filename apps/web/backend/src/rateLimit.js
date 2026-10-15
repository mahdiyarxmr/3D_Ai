/**
 * Minimal fixed-window rate limiter.
 *
 * Used to bound abuse on public endpoints (registration, login, chat streaming).
 * In-memory state is sufficient for a single instance; a multi-instance
 * deployment must back this with a shared store (see docs/WEB_ARCHITECTURE.md).
 */
export function createRateLimiter({ windowMs = 60_000, max = 60, keyGenerator } = {}) {
  const buckets = new Map();

  function sweep(now) {
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key);
    }
  }

  const middleware = (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 10_000) sweep(now);

    const key = keyGenerator ? keyGenerator(req) : req.ip || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'rate_limited', retryAfter });
    }
    return next();
  };

  middleware.reset = () => buckets.clear();
  return middleware;
}
