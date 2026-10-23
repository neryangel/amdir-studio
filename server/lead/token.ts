// Signed render timestamp for the time-trap.
// GET /api/lead returns "<issuedAtMs>.<hmac>". The form sends it back on submit.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MAX_TOKEN_AGE_MS, MIN_FILL_MS } from '../../src/lib/lead-shared';

function sign(issuedAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`lead-token:${issuedAt}`).digest('base64url');
}

export function issueToken(now: number, secret: string): string {
  return `${now}.${sign(now, secret)}`;
}

export type TokenCheck = { ok: true } | { ok: false; reason: 'malformed' | 'bad_signature' | 'too_fast' | 'expired' };

export function checkToken(token: string, now: number, secret: string): TokenCheck {
  const [ts, mac] = token.split('.');
  const issuedAt = Number(ts);
  if (!ts || !mac || !Number.isSafeInteger(issuedAt)) return { ok: false, reason: 'malformed' };
  const expected = Buffer.from(sign(issuedAt, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad_signature' };
  const age = now - issuedAt;
  if (age < MIN_FILL_MS) return { ok: false, reason: 'too_fast' };
  if (age > MAX_TOKEN_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true };
}
