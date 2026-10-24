import { appendFile, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLeadHandler, type LeadDeps, type Logger } from '../server/lead/handler';
import { createRateLimiter, rateKey } from '../server/lead/rateLimit';
import { MIN_SECRET_LENGTH, depsFromEnv } from '../server/lead/config';
import { checkToken, issueToken } from '../server/lead/token';
import { maskContact, maskEmail, maskName, maskPhone, maskText } from '../server/lead/mask';
import { NoopNotifier, ResendNotifier, type Notifier } from '../server/lead/notify';
import { SupabaseRestStore, TIMEOUT_MS, UnconfiguredStore, type LeadStore } from '../server/lead/store';
import { JsonlFileStore } from '../server/lead/jsonlStore';
import { NOTICE_VERSION } from '../src/lib/lead-shared';

const SECRET = 'test-secret';
const T0 = 1_800_000_000_000;

function collectingLogger() {
  const lines: string[] = [];
  const logger: Logger = {
    info: (event, data) => lines.push(JSON.stringify({ event, ...data })),
    error: (event, data) => lines.push(JSON.stringify({ event, ...data })),
  };
  return { logger, lines };
}

function okStore(): LeadStore & { insert: ReturnType<typeof vi.fn>; countRecent: ReturnType<typeof vi.fn> } {
  return { kind: 'mem', insert: vi.fn(async () => ({ id: 'lead-1' })), countRecent: vi.fn(async () => 0) };
}

function setup(over: Partial<LeadDeps> = {}, nowMs = T0 + 5000) {
  const { logger, lines } = collectingLogger();
  const deps: LeadDeps = {
    store: okStore(),
    notifier: new NoopNotifier(),
    rateLimiter: createRateLimiter({ limit: 5, windowMs: 60_000 }),
    secret: SECRET,
    now: () => nowMs,
    logger,
    ...over,
  };
  return { handle: createLeadHandler(deps), deps, lines };
}

const valid = (over: Record<string, unknown> = {}) => ({
  name: 'דנה לוי',
  contact: 'dana@example.com',
  need: 'clip',
  details: 'קליפ לשיר חדש, יש תאריך יעד בדצמבר',
  source: 'contact',
  privacyConsent: true,
  marketingOptIn: false,
  website: '',
  token: issueToken(T0, SECRET),
  noticeVersion: NOTICE_VERSION,
  ...over,
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('validation', () => {
  it('accepts a valid submission and returns 200 with the stored id', async () => {
    const { handle, deps } = setup();
    const res = await handle(post(valid()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'lead-1' });
    expect(deps.store.insert).toHaveBeenCalledOnce();
  });

  it('stores the consent record with the lead', async () => {
    const { handle, deps } = setup();
    await handle(post(valid({ marketingOptIn: true })));
    const record = (deps.store.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(record).toMatchObject({
      privacy_consent: true,
      marketing_opt_in: true,
      notice_version: NOTICE_VERSION,
      consent_at: new Date(T0 + 5000).toISOString(),
      contact_type: 'email',
    });
    expect(record.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(record)).not.toContain('203.0.113.7');
  });

  it('defaults marketingOptIn to false', async () => {
    const { handle, deps } = setup();
    const { marketingOptIn: _omit, ...body } = valid();
    await handle(post(body));
    expect((deps.store.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].marketing_opt_in).toBe(false);
  });

  it.each([
    ['missing name', { name: '' }, 'name'],
    ['bad contact', { contact: 'not a phone' }, 'contact'],
    ['unknown need', { need: 'logo' }, 'need'],
    ['empty details', { details: '   ' }, 'details'],
    ['bad source', { source: 'newsletter' }, 'source'],
    ['no privacy consent', { privacyConsent: false }, 'privacyConsent'],
    ['extra field', { idNumber: '123456789' }, 'unknown_keys'],
    ['CR/LF in name (forged email line)', { name: 'דנה\r\nמזהה: 123' }, 'name'],
    ['LF in contact', { contact: 'dana@example.com\nBcc: x@y.co' }, 'contact'],
    ['control char in name', { name: 'דנה\u0007' }, 'name'],
    ['U+2028 line separator in name', { name: 'דנה\u2028לוי' }, 'name'],
  ])('rejects %s with 400', async (_label, over, field) => {
    const { handle, deps } = setup();
    const res = await handle(post(valid(over)));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fields: string[] };
    expect(body.fields).toContain(field);
    expect(deps.store.insert).not.toHaveBeenCalled();
  });

  it('accepts an Israeli phone number as contact', async () => {
    const { handle, deps } = setup();
    const res = await handle(post(valid({ contact: '050-123-4567' })));
    expect(res.status).toBe(200);
    expect((deps.store.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].contact_type).toBe('phone');
  });

  it('accepts JSON only (415) and caps the body at 16 KB (413)', async () => {
    const { handle } = setup();
    expect((await handle(post('name=x', { 'content-type': 'application/x-www-form-urlencoded' }))).status).toBe(415);
    expect((await handle(post(valid({ details: 'א'.repeat(9000) })))).status).toBe(413);
    expect((await handle(post('{not json'))).status).toBe(400);
  });

  it('answers GET with a token and other methods with 405', async () => {
    const { handle } = setup();
    const res = await handle(new Request('http://localhost/api/lead'));
    const body = (await res.json()) as { token: string; noticeVersion: string };
    expect(body.token).toMatch(/^\d+\./);
    expect(body.noticeVersion).toBe(NOTICE_VERSION);
    expect((await handle(new Request('http://localhost/api/lead', { method: 'PUT' }))).status).toBe(405);
  });
});

describe('honeypot', () => {
  it('rejects when the hidden field is filled, without storing', async () => {
    const { handle, deps } = setup();
    const res = await handle(post(valid({ website: 'http://spam.example' })));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'rejected' });
    expect(deps.store.insert).not.toHaveBeenCalled();
  });
});

describe('time-trap', () => {
  it('rejects a submission less than 3 s after the token was issued', async () => {
    const { handle, deps } = setup({}, T0 + 2999);
    const res = await handle(post(valid()));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'too_fast' });
    expect(deps.store.insert).not.toHaveBeenCalled();
  });

  it('accepts at exactly 3 s', () => {
    expect(checkToken(issueToken(T0, SECRET), T0 + 3000, SECRET)).toEqual({ ok: true });
  });

  it('rejects forged or tampered tokens and expired ones', () => {
    expect(checkToken(`${T0 - 10_000}.forged`, T0, SECRET)).toEqual({ ok: false, reason: 'bad_signature' });
    const [, mac] = issueToken(T0, SECRET).split('.');
    expect(checkToken(`${T0 - 60_000}.${mac}`, T0, SECRET)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(checkToken(issueToken(T0, 'other-secret'), T0 + 5000, SECRET).ok).toBe(false);
    expect(checkToken('garbage', T0, SECRET)).toEqual({ ok: false, reason: 'malformed' });
    expect(checkToken(issueToken(T0, SECRET), T0 + 7 * 3600_000, SECRET)).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('rate limit', () => {
  it('allows 5 per window per IP, then 429 with Retry-After', async () => {
    const { handle } = setup();
    for (let i = 0; i < 5; i++) expect((await handle(post(valid()))).status).toBe(200);
    const res = await handle(post(valid()));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    // another IP is unaffected
    expect((await handle(post(valid(), { 'x-real-ip': '198.51.100.9' }))).status).toBe(200);
  });

  it('keys IPv6 on its /64 prefix, so rotating addresses inside it does not help', async () => {
    const { handle } = setup();
    for (let i = 1; i <= 5; i++) expect((await handle(post(valid(), { 'x-real-ip': `2001:db8:1:2::${i}` }))).status).toBe(200);
    expect((await handle(post(valid(), { 'x-real-ip': '2001:db8:1:2:ffff:abcd:1234:9' }))).status).toBe(429);
    // a different /64 is unaffected
    expect((await handle(post(valid(), { 'x-real-ip': '2001:db8:1:3::1' }))).status).toBe(200);
  });

  it('rateKey: IPv4 unchanged, IPv6 → /64, IPv4-mapped IPv6 → IPv4', () => {
    expect(rateKey('203.0.113.7')).toBe('203.0.113.7');
    expect(rateKey('2001:DB8:0:0:1:2:3:4')).toBe('2001:db8:0:0::/64');
    expect(rateKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateKey('[2001:db8:a:b::1]')).toBe('2001:db8:a:b::/64');
    expect(rateKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(rateKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(rateKey('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(rateKey('::1')).toBe('0:0:0:0::/64');
    expect(rateKey('unknown')).toBe('unknown');
  });

  it('IPv6 addresses in one /64 share an ip_hash; the raw address is never stored', async () => {
    const { handle, deps } = setup();
    await handle(post(valid(), { 'x-real-ip': '2001:db8:1:2::1' }));
    await handle(post(valid(), { 'x-real-ip': '2001:db8:1:2::2' }));
    const calls = (deps.store.insert as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]?.[0].ip_hash).toBe(calls[1]?.[0].ip_hash);
    expect(JSON.stringify(calls)).not.toContain('2001:db8');
  });

  it('durable check: rejects with 429 when the store already holds `limit` recent leads for this ip_hash', async () => {
    const store = okStore();
    store.countRecent.mockResolvedValue(5);
    const { handle } = setup({ store });
    const res = await handle(post(valid()));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: 'rate_limited' });
    expect(Number(res.headers.get('retry-after'))).toBe(60);
    expect(store.insert).not.toHaveBeenCalled();
    // counted for the same ip_hash the lead would be stored with, over the limiter window
    const [ipHash, since] = store.countRecent.mock.calls[0] as [string, string];
    expect(ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(since).toBe(new Date(T0 + 5000 - 60_000).toISOString());
  });

  it('durable check: below the limit the lead is stored', async () => {
    const store = okStore();
    store.countRecent.mockResolvedValue(4);
    const { handle } = setup({ store });
    expect((await handle(post(valid()))).status).toBe(200);
    expect(store.insert).toHaveBeenCalledOnce();
  });

  it('durable check: a failing count never blocks the lead, and is logged without PII', async () => {
    const store = okStore();
    store.countRecent.mockRejectedValue(new Error('supabase count failed: HTTP 500'));
    const { handle, lines } = setup({ store });
    const res = await handle(post(valid()));
    expect(res.status).toBe(200);
    expect(store.insert).toHaveBeenCalledOnce();
    const all = lines.join('\n');
    expect(all).toContain('lead_rate_count_failed');
    for (const secret of ['דנה לוי', 'dana@example.com', '203.0.113.7']) expect(all).not.toContain(secret);
  });

  it('frees the slot after the window', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.hit('a', 0)).toBe(0);
    expect(rl.hit('a', 500)).toBeGreaterThan(0);
    expect(rl.hit('a', 1001)).toBe(0);
  });
});

describe('store first, then notify', () => {
  it('store success + notify failure → still 200, failure logged', async () => {
    const failing: Notifier = { kind: 'boom', notify: vi.fn(async () => Promise.reject(new Error('smtp down'))) };
    const { handle, lines } = setup({ notifier: failing });
    const res = await handle(post(valid()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'lead-1' });
    expect(lines.some((l) => l.includes('lead_notify_failed'))).toBe(true);
  });

  it('store failure → 503 and the notifier is never called', async () => {
    const notifier: Notifier = { kind: 'spy', notify: vi.fn(async () => {}) };
    const { handle } = setup({ notifier, store: { kind: 'bad', insert: async () => Promise.reject(new Error('db down')), countRecent: async () => 0 } });
    const res = await handle(post(valid()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'store_failed' });
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('unconfigured store → 503, never a fake success', async () => {
    const { handle } = setup({ store: new UnconfiguredStore() });
    expect((await handle(post(valid()))).status).toBe(503);
  });

  it('notifies only after the store resolved', async () => {
    const order: string[] = [];
    const store: LeadStore = { kind: 'o', insert: async () => (order.push('store'), { id: 'x' }), countRecent: async () => 0 };
    const notifier: Notifier = { kind: 'o', notify: async () => void order.push('notify') };
    const { handle } = setup({ store, notifier });
    await handle(post(valid()));
    expect(order).toEqual(['store', 'notify']);
  });
});

describe('masking', () => {
  it('masks contact details and free text', () => {
    expect(maskEmail('dana.levi@example.co.il')).toBe('d***@e***.co.il');
    expect(maskPhone('050-123-4567')).toBe('***67');
    expect(maskContact('050-123-4567')).toBe('***67');
    expect(maskName('דנה לוי')).toBe('ד***');
    expect(maskText('שלום עולם')).toBe('[9 chars]');
  });

  it('never writes name, contact or details to the logs in plain text', async () => {
    const failing: Notifier = { kind: 'boom', notify: async () => Promise.reject(new Error('x')) };
    const { handle, lines } = setup({ notifier: failing });
    await handle(post(valid()));
    const { handle: h2, lines: l2 } = setup({ store: { kind: 'bad', insert: async () => Promise.reject(new Error('db')), countRecent: async () => 0 } });
    await h2(post(valid()));
    const all = [...lines, ...l2].join('\n');
    expect(all).toContain('lead_stored');
    expect(all).toContain('lead_store_failed');
    for (const secret of ['דנה לוי', 'dana@example.com', 'קליפ לשיר חדש', '203.0.113.7']) expect(all).not.toContain(secret);
  });
});

describe('adapters', () => {
  it('SupabaseRestStore posts to /rest/v1/<table> with the key in apikey only (sb_secret_)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 'uuid-1' }]), { status: 201 }));
    const store = new SupabaseRestStore({ url: 'https://x.supabase.co/', serviceKey: 'sb_secret_abc', table: 'studio_leads', fetch: fetchMock });
    const { id } = await store.insert({} as never);
    expect(id).toBe('uuid-1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/studio_leads?select=id');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_secret_abc');
    expect(headers.authorization).toBeUndefined();
    expect(headers.prefer).toBe('return=representation');
  });

  it('SupabaseRestStore throws on non-2xx (so the handler answers 503)', async () => {
    const store = new SupabaseRestStore({ url: 'https://x', serviceKey: 'eyJ.legacy', fetch: async () => new Response('no', { status: 401 }) });
    await expect(store.insert({} as never)).rejects.toThrow('HTTP 401');
  });

  it('SupabaseRestStore.countRecent: HEAD with count=exact, filtered by ip_hash and created_at', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200, headers: { 'content-range': '*/3' } }));
    const store = new SupabaseRestStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_abc', fetch: fetchMock });
    expect(await store.countRecent('abc123', '2027-01-15T08:00:00.000Z')).toBe(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/studio_leads?select=id&ip_hash=eq.abc123&created_at=gte.2027-01-15T08%3A00%3A00.000Z');
    expect(init.method).toBe('HEAD');
    const headers = init.headers as Record<string, string>;
    expect(headers.prefer).toBe('count=exact');
    expect(headers.apikey).toBe('sb_secret_abc');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('SupabaseRestStore.countRecent throws on non-2xx or a missing total', async () => {
    const s1 = new SupabaseRestStore({ url: 'https://x', serviceKey: 'k', fetch: async () => new Response(null, { status: 500 }) });
    await expect(s1.countRecent('h', 'now')).rejects.toThrow('HTTP 500');
    const s2 = new SupabaseRestStore({ url: 'https://x', serviceKey: 'k', fetch: async () => new Response(null, { status: 200 }) });
    await expect(s2.countRecent('h', 'now')).rejects.toThrow('no total');
  });

  it('timeouts: count + store + notify fit inside vercel.json maxDuration with margin', async () => {
    const vercel = JSON.parse(await readFile(path.join(import.meta.dirname, '..', 'vercel.json'), 'utf8')) as {
      functions: Record<string, { maxDuration: number }>;
    };
    const budgetMs = (vercel.functions['api/lead.ts']?.maxDuration ?? 0) * 1000;
    expect(TIMEOUT_MS.count + TIMEOUT_MS.store + TIMEOUT_MS.notify).toBeLessThanOrEqual(budgetMs - 1000);
  });

  it('a hung store aborts at its timeout instead of running past the function limit', async () => {
    const hang = (_: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
    const store = new SupabaseRestStore({ url: 'https://x', serviceKey: 'k', fetch: hang, timeoutMs: 20 });
    await expect(store.insert({} as never)).rejects.toThrow();
    const n = new ResendNotifier({ apiKey: 'k', from: 'f', to: 't', fetch: hang, timeoutMs: 20 });
    await expect(n.notify('id', { brief: null } as never)).rejects.toThrow();
  });

  it('ResendNotifier posts to the Resend API with an idempotency key', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"e1"}', { status: 200 }));
    const n = new ResendNotifier({ apiKey: 're_test', from: 'AMDIR <leads@example.com>', to: 'owner@example.com', fetch: fetchMock });
    await n.notify('lead-9', { source: 'contact', name: 'א', contact: 'a@b.co', contact_type: 'email', need: 'web', details: 'd', brief: { songUrl: 'https://x.co/s' }, privacy_consent: true, marketing_opt_in: false, notice_version: 'v', consent_at: 'now', ip_hash: 'h' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('lead-lead-9');
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ['owner@example.com'], reply_to: 'a@b.co' });
  });

  it('JsonlFileStore appends one JSON line per lead', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'leads-'));
    const file = path.join(dir, 'leads.jsonl');
    const store = new JsonlFileStore(file);
    await store.insert({ source: 'pilot' } as never);
    await store.insert({ source: 'contact' } as never);
    const lines = (await readFile(file, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ source: 'pilot' });
    expect(lines[0].id).toBeTruthy();
  });

  it('JsonlFileStore.countRecent counts this ip_hash since the cutoff and skips bad lines', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'leads-'));
    const file = path.join(dir, 'leads.jsonl');
    const store = new JsonlFileStore(file);
    expect(await store.countRecent('h1', new Date(0).toISOString())).toBe(0); // no file yet
    await store.insert({ ip_hash: 'h1' } as never);
    await store.insert({ ip_hash: 'h1' } as never);
    await store.insert({ ip_hash: 'h2' } as never);
    await appendFile(file, '{broken\n', 'utf8');
    expect(await store.countRecent('h1', new Date(Date.now() - 60_000).toISOString())).toBe(2);
    expect(await store.countRecent('h2', new Date(Date.now() - 60_000).toISOString())).toBe(1);
    expect(await store.countRecent('h1', new Date(Date.now() + 60_000).toISOString())).toBe(0);
  });
});

describe('config', () => {
  const supabase = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'sb_secret_abc', VERCEL: '1' };

  it(`treats a LEAD_SECRET shorter than ${MIN_SECRET_LENGTH} chars as missing (store unconfigured → 503)`, async () => {
    const short = await depsFromEnv({ ...supabase, LEAD_SECRET: 'x'.repeat(MIN_SECRET_LENGTH - 1) });
    expect(short.store.kind).toBe('unconfigured');
    expect(short.secret).not.toBe('x'.repeat(MIN_SECRET_LENGTH - 1));
    expect((await depsFromEnv(supabase)).store.kind).toBe('unconfigured');
  });

  it(`accepts a LEAD_SECRET of ${MIN_SECRET_LENGTH}+ chars`, async () => {
    const secret = 'x'.repeat(MIN_SECRET_LENGTH);
    const deps = await depsFromEnv({ ...supabase, LEAD_SECRET: secret });
    expect(deps.store.kind).toBe('supabase');
    expect(deps.secret).toBe(secret);
  });

  it('wires the default 5-per-10-minutes limit used by both rate-limit checks', async () => {
    const deps = await depsFromEnv({ ...supabase, LEAD_SECRET: 'x'.repeat(MIN_SECRET_LENGTH) });
    expect(deps.rateLimiter.limit).toBe(5);
    expect(deps.rateLimiter.windowMs).toBe(10 * 60 * 1000);
  });
});
