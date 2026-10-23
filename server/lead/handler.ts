// POST /api/lead  (JSON, ≤16 KB) → validate → time-trap → rate limit → STORE → notify.
// GET  /api/lead  → { token } for the time-trap.
// Response rules:
//   200 { ok: true, id }      only after the store succeeded (even if the notification then failed)
//   4xx { ok: false, error }  bad input / too fast / rate limited
//   503 { ok: false, error }  store failed or not configured (the visitor sees a Hebrew error + WhatsApp)
import { LIMITS, NOTICE_VERSION, contactKind } from '../../src/lib/lead-shared';
import { LeadInput, invalidFields } from './schema';
import { checkToken, issueToken } from './token';
import { clientIp, type RateLimiter } from './rateLimit';
import { hashIp, maskContact, maskName, maskText } from './mask';
import type { LeadRecord, LeadStore } from './store';
import type { Notifier } from './notify';

export interface Logger {
  info(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

export const jsonLogger: Logger = {
  info: (event, data) => console.log(JSON.stringify({ level: 'info', event, ...data })),
  error: (event, data) => console.error(JSON.stringify({ level: 'error', event, ...data })),
};

export interface LeadDeps {
  store: LeadStore;
  notifier: Notifier;
  rateLimiter: RateLimiter;
  /** HMAC secret for tokens and IP hashing. */
  secret: string;
  now?: () => number;
  logger?: Logger;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

class TooLarge extends Error {}

async function readLimited(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new TooLarge();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new TooLarge();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function createLeadHandler(deps: LeadDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.logger ?? jsonLogger;

  return async function handle(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return reply(200, { token: issueToken(now(), deps.secret), noticeVersion: NOTICE_VERSION });
    }
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'method_not_allowed' }, { allow: 'GET, POST' });

    const type = request.headers.get('content-type') ?? '';
    if (!/^application\/json\b/i.test(type)) return reply(415, { ok: false, error: 'json_only' });

    let raw: string;
    try {
      raw = await readLimited(request, LIMITS.bodyBytes);
    } catch (e) {
      if (e instanceof TooLarge) return reply(413, { ok: false, error: 'too_large' });
      return reply(400, { ok: false, error: 'bad_body' });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(400, { ok: false, error: 'bad_json' });
    }

    const parsed = LeadInput.safeParse(body);
    if (!parsed.success) {
      return reply(400, { ok: false, error: 'invalid', fields: invalidFields(parsed.error) });
    }
    const input = parsed.data;

    if (input.website.trim() !== '') {
      log.info('lead_rejected', { reason: 'honeypot' });
      return reply(400, { ok: false, error: 'rejected' });
    }

    const t = now();
    const token = checkToken(input.token, t, deps.secret);
    if (!token.ok) {
      log.info('lead_rejected', { reason: token.reason });
      return reply(400, { ok: false, error: token.reason === 'too_fast' ? 'too_fast' : 'token' });
    }

    const ip = clientIp(request);
    const wait = deps.rateLimiter.hit(ip, t);
    if (wait > 0) {
      log.info('lead_rejected', { reason: 'rate_limited' });
      return reply(429, { ok: false, error: 'rate_limited' }, { 'retry-after': String(wait) });
    }

    const record: LeadRecord = {
      source: input.source,
      name: input.name,
      contact: input.contact,
      contact_type: contactKind(input.contact) ?? 'phone',
      need: input.need,
      details: input.details,
      privacy_consent: true,
      marketing_opt_in: input.marketingOptIn,
      notice_version: input.noticeVersion,
      consent_at: new Date(t).toISOString(),
      ip_hash: hashIp(ip, deps.secret),
    };
    const masked = {
      source: record.source,
      need: record.need,
      name: maskName(record.name),
      contact: maskContact(record.contact),
      details: maskText(record.details),
      marketingOptIn: record.marketing_opt_in,
    };

    let id: string;
    try {
      ({ id } = await deps.store.insert(record));
    } catch (e) {
      log.error('lead_store_failed', { store: deps.store.kind, error: e instanceof Error ? e.message : 'unknown', ...masked });
      return reply(503, { ok: false, error: 'store_failed' });
    }
    log.info('lead_stored', { id, store: deps.store.kind, ...masked });

    try {
      await deps.notifier.notify(id, record);
    } catch (e) {
      // The lead is safe in the store. Log and still answer 200.
      log.error('lead_notify_failed', { id, notifier: deps.notifier.kind, error: e instanceof Error ? e.message : 'unknown' });
    }
    return reply(200, { ok: true, id });
  };
}
