// Best-effort, in-memory, per-IP sliding window. Each serverless instance has its own
// memory, so this slows down a single abuser; it is not a global guarantee. The handler
// adds a durable check through the store (LeadStore.countRecent) after this cheap gate.
import { isIPv4, isIPv6 } from 'node:net';

export interface RateLimiter {
  /** Max hits per key per window (also used for the durable store check). */
  readonly limit: number;
  readonly windowMs: number;
  /** Returns 0 when allowed, otherwise the seconds to wait. */
  hit(key: string, now: number): number;
}

export const RATE_LIMIT: { readonly limit: number; readonly windowMs: number } = { limit: 5, windowMs: 10 * 60 * 1000 };

export function createRateLimiter({ limit = RATE_LIMIT.limit, windowMs = RATE_LIMIT.windowMs, maxKeys = 5000 } = {}): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    limit,
    windowMs,
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

/** The 8 hextets of a valid IPv6 address (handles "::" and a trailing dotted IPv4). */
function hextets(addr: string): number[] {
  let s = addr;
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    s = `${s.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t];
  return groups.map((g) => parseInt(g, 16));
}

/**
 * Rate-limit key for an IP. IPv4 stays as is. IPv6 is keyed on its /64 prefix, because one
 * client usually owns a whole /64 and can rotate addresses inside it. IPv4-mapped IPv6
 * (::ffff:a.b.c.d) is keyed as the IPv4 address.
 */
export function rateKey(ip: string): string {
  const addr = ip.trim().replace(/^\[(.*)\]$/, '$1').replace(/%.*$/, '').toLowerCase();
  if (isIPv4(addr) || !isIPv6(addr)) return addr;
  const g = hextets(addr);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    const [hi = 0, lo = 0] = g.slice(6);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  }
  return `${g
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(':')}::/64`;
}
