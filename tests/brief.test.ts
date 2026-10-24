import { describe, expect, it } from 'vitest';
import { LeadInput } from '../server/lead/schema';
import { createLeadHandler, type Logger } from '../server/lead/handler';
import { createRateLimiter } from '../server/lead/rateLimit';
import { issueToken } from '../server/lead/token';
import { NoopNotifier } from '../server/lead/notify';
import type { LeadRecord, LeadStore } from '../server/lead/store';
import { BRIEF_GROUPS, NOTICE_VERSION, briefGroupFor, isHttpUrl } from '../src/lib/lead-shared';

const SECRET = 's';
const T0 = 1_800_000_000_000;
const base = (over: Record<string, unknown> = {}) => ({
  name: 'רון',
  contact: '052-765-4321',
  need: 'clip',
  details: 'שיר חדש',
  source: 'contact',
  privacyConsent: true,
  token: issueToken(T0, SECRET),
  noticeVersion: NOTICE_VERSION,
  ...over,
});

describe('brief schema', () => {
  it('maps every need to its group', () => {
    expect(briefGroupFor('clip')).toBe('media');
    expect(briefGroupFor('video')).toBe('media');
    expect(briefGroupFor('ai')).toBe('media');
    expect(briefGroupFor('web')).toBe('web');
    expect(briefGroupFor('pilot')).toBe('pilot');
    expect(briefGroupFor('other')).toBeNull();
  });

  it.each([
    ['clip', { songUrl: 'https://youtu.be/abc', releaseDate: '2026-03', referenceUrl: 'http://vimeo.com/1' }],
    ['video', { releaseDate: '2026-03-14' }],
    ['web', { currentSiteUrl: 'https://example.co.il', siteGoal: 'leads', desiredDate: '2027-01' }],
    ['pilot', { eventsPerYear: '31-60', currentTools: 'Pixieset, גוגל שיטס' }],
  ])('accepts a valid %s brief', (need, brief) => {
    const r = LeadInput.safeParse(base({ need, source: need === 'pilot' ? 'pilot' : 'contact', brief }));
    expect(r.success).toBe(true);
  });

  it('brief is optional, and an empty brief is fine', () => {
    expect(LeadInput.safeParse(base()).success).toBe(true);
    expect(LeadInput.safeParse(base({ brief: {} })).success).toBe(true);
  });

  it.each([
    ['javascript: URL', { songUrl: 'javascript:alert(1)' }, 'brief.songUrl'],
    ['data: URL', { songUrl: 'data:text/html,hi' }, 'brief.songUrl'],
    ['ftp URL', { referenceUrl: 'ftp://files.example.com/x' }, 'brief.referenceUrl'],
    ['no scheme', { songUrl: 'youtube.com/watch?v=1' }, 'brief.songUrl'],
    ['too long URL', { songUrl: `https://x.co/${'a'.repeat(600)}` }, 'brief.songUrl'],
    ['bad date', { releaseDate: 'מרץ' }, 'brief.releaseDate'],
    ['month 13', { releaseDate: '2026-13' }, 'brief.releaseDate'],
    ['unknown key', { budget: '5000' }, 'brief.unknown_keys'],
    ['field from another group', { siteGoal: 'leads' }, 'brief.siteGoal'],
  ])('rejects %s', (_l, brief, field) => {
    const r = LeadInput.safeParse(base({ brief }));
    expect(r.success).toBe(false);
    if (!r.success) {
      const fields = r.error.issues.map((i) => (i.path[0] === 'brief' ? (i.path[1] ? `brief.${String(i.path[1])}` : i.code === 'unrecognized_keys' ? 'brief.unknown_keys' : 'brief') : String(i.path[0])));
      expect(fields).toContain(field);
    }
  });

  it('rejects bad enums and over-long text in the pilot and web groups', () => {
    expect(LeadInput.safeParse(base({ need: 'web', brief: { siteGoal: 'fame' } })).success).toBe(false);
    expect(LeadInput.safeParse(base({ need: 'pilot', source: 'pilot', brief: { eventsPerYear: '1000' } })).success).toBe(false);
    expect(LeadInput.safeParse(base({ need: 'pilot', source: 'pilot', brief: { currentTools: 'א'.repeat(301) } })).success).toBe(false);
  });

  it('need "other" accepts no brief fields at all', () => {
    for (const group of Object.values(BRIEF_GROUPS)) {
      const field: string = group.fields[0];
      const value = field === 'siteGoal' ? 'leads' : field === 'eventsPerYear' ? '1-10' : field.endsWith('Date') ? '2026-01' : field.endsWith('Url') ? 'https://a.co' : 'x';
      expect(LeadInput.safeParse(base({ need: 'other', brief: { [field]: value } })).success).toBe(false);
    }
  });

  it('isHttpUrl', () => {
    expect(isHttpUrl('https://open.spotify.com/track/1')).toBe(true);
    expect(isHttpUrl('http://localhost')).toBe(false);
    expect(isHttpUrl('mailto:a@b.co')).toBe(false);
  });
});

describe('brief through the handler', () => {
  function setup() {
    const lines: string[] = [];
    const logger: Logger = { info: (e, d) => lines.push(JSON.stringify({ e, ...d })), error: (e, d) => lines.push(JSON.stringify({ e, ...d })) };
    const stored: LeadRecord[] = [];
    const store: LeadStore = { kind: 'mem', insert: async (r) => (stored.push(r), { id: 'x' }), countRecent: async () => 0 };
    const handle = createLeadHandler({ store, notifier: new NoopNotifier(), rateLimiter: createRateLimiter({ limit: 100 }), secret: SECRET, now: () => T0 + 4000, logger });
    return { handle, lines, stored };
  }
  const post = (body: unknown) =>
    new Request('http://x/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('stores the brief as an object and logs field names only', async () => {
    const { handle, lines, stored } = setup();
    const res = await handle(post(base({ brief: { songUrl: 'https://youtu.be/secret-song', releaseDate: '2026-05' } })));
    expect(res.status).toBe(200);
    expect(stored[0]?.brief).toEqual({ songUrl: 'https://youtu.be/secret-song', releaseDate: '2026-05' });
    const log = lines.join('\n');
    expect(log).toContain('"briefFields":["songUrl","releaseDate"]');
    expect(log).not.toContain('secret-song');
    expect(log).not.toContain('2026-05');
  });

  it('stores null when no brief was given', async () => {
    const { handle, stored } = setup();
    await handle(post(base()));
    expect(stored[0]?.brief).toBeNull();
  });

  it('answers 400 with the nested field name for a bad brief URL', async () => {
    const { handle, stored } = setup();
    const res = await handle(post(base({ brief: { referenceUrl: 'javascript:alert(1)' } })));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid', fields: ['brief.referenceUrl'] });
    expect(stored).toHaveLength(0);
  });
});
