const buckets = new Map();

export function createRateLimiter({ windowMs = 60_000, max = 60, message = "Too many requests. Please try again shortly." } = {}) {
  return (req, res, next) => {
    const key = `${req.ip || req.socket?.remoteAddress || "unknown"}:${req.baseUrl || ""}:${req.path || ""}`;
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || now >= current.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= max) {
      res.set("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message });
    }
    current.count += 1;
    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60_000).unref();
