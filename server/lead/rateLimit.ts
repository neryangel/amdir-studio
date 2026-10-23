// Best-effort, in-memory, per-IP sliding window. Each serverless instance has its own
// memory, so this slows down a single abuser; it is not a global guarantee.
export interface RateLimiter {
  /** Returns 0 when allowed, otherwise the seconds to wait. */
  hit(key: string, now: number): number;
}

export function createRateLimiter({ limit = 5, windowMs = 10 * 60 * 1000, maxKeys = 5000 } = {}): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const oldest = recent[0] ?? now;
        return Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        const first = hits.keys().next().value;
        if (first !== undefined) hits.delete(first);
      }
      return 0;
    },
  };
}

/** Client IP from the proxy headers Vercel sets. */
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return (fwd.split(',')[0] ?? '').trim() || 'unknown';
  return 'unknown';
}
