import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLeadHandler, type LeadDeps, type Logger } from '../server/lead/handler';
import { createRateLimiter } from '../server/lead/rateLimit';
import { checkToken, issueToken } from '../server/lead/token';
import { maskContact, maskEmail, maskName, maskPhone, maskText } from '../server/lead/mask';
import { NoopNotifier, ResendNotifier, type Notifier } from '../server/lead/notify';
import { SupabaseRestStore, UnconfiguredStore, type LeadStore } from '../server/lead/store';
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

function okStore(): LeadStore & { insert: ReturnType<typeof vi.fn> } {
  return { kind: 'mem', insert: vi.fn(async () => ({ id: 'lead-1' })) };
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
    const { handle } = setup({ notifier, store: { kind: 'bad', insert: async () => Promise.reject(new Error('db down')) } });
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
    const store: LeadStore = { kind: 'o', insert: async () => (order.push('store'), { id: 'x' }) };
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
    const { handle: h2, lines: l2 } = setup({ store: { kind: 'bad', insert: async () => Promise.reject(new Error('db')) } });
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

  it('ResendNotifier posts to the Resend API with an idempotency key', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"e1"}', { status: 200 }));
    const n = new ResendNotifier({ apiKey: 're_test', from: 'AMDIR <leads@example.com>', to: 'owner@example.com', fetch: fetchMock });
    await n.notify('lead-9', { source: 'contact', name: 'א', contact: 'a@b.co', contact_type: 'email', need: 'web', details: 'd', privacy_consent: true, marketing_opt_in: false, notice_version: 'v', consent_at: 'now', ip_hash: 'h' });
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
});
