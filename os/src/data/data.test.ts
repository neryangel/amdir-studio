import { beforeEach, describe, expect, it } from 'vitest';
import type { StudioLeadRow } from '../domain/lead';
import { quoteTotals } from '../domain/quote';
import { DATA_KEY, createMemoryRepositories } from './memoryRepositories';
import { NotFoundError, ValidationError } from './repositories';
import { buildDemoSeed } from './seed';
import { type KeyValueStorage, createMemoryStorage, createSafeStorage } from './storage';

const NOW = '2026-10-24T07:00:00.000Z';

function setup(storage: KeyValueStorage = createMemoryStorage()) {
  let n = 0;
  let clock = NOW;
  const repos = createMemoryRepositories({ storage, now: () => clock, newId: (p) => `${p}-t${String((n += 1))}` });
  return { repos, storage, setNow: (v: string) => (clock = v) };
}

describe('demo seed', () => {
  it('is deterministic for the same day', () => {
    expect(buildDemoSeed(NOW)).toEqual(buildDemoSeed(NOW));
  });
  it('marks every record demo and uses only fictional contacts', () => {
    const seed = buildDemoSeed(NOW);
    const all = Object.values(seed).flat() as { demo: boolean }[];
    expect(all.length).toBeGreaterThan(40);
    expect(all.every((r) => r.demo)).toBe(true);
    for (const c of seed.clients) {
      expect(c.name).toMatch(/לדוגמה/);
      if (c.email) expect(c.email.endsWith('.invalid')).toBe(true);
    }
    for (const l of seed.leads) if (l.contactType === 'email') expect(l.contact.endsWith('.invalid')).toBe(true);
  });
  it('covers every working stage but one on the board and has referential integrity', () => {
    const seed = buildDemoSeed(NOW);
    const clientIds = new Set(seed.clients.map((c) => c.id));
    const projectIds = new Set(seed.projects.map((p) => p.id));
    for (const p of seed.projects) expect(clientIds.has(p.clientId)).toBe(true);
    for (const t of seed.tasks) expect(projectIds.has(t.projectId)).toBe(true);
    for (const q of seed.quotes) expect(projectIds.has(q.projectId) && clientIds.has(q.clientId)).toBe(true);
    const assetIds = new Set(seed.assets.map((a) => a.id));
    for (const v of seed.versions) expect(assetIds.has(v.assetId)).toBe(true);
    for (const q of seed.quotes) expect(Number.isSafeInteger(quoteTotals(q).total)).toBe(true);
  });
});

describe('storage', () => {
  it('safe storage falls back to memory when localStorage throws', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    };
    const s = createSafeStorage(() => throwing);
    expect(s.persistent()).toBe(false);
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
    s.removeItem('k');
    expect(s.getItem('k')).toBeNull();
  });
  it('safe storage handles a missing storage and an accessor that throws', () => {
    expect(createSafeStorage(() => null).persistent()).toBe(false);
    const s = createSafeStorage(() => {
      throw new Error('blocked');
    });
    s.setItem('a', '1');
    expect(s.getItem('a')).toBe('1');
  });
  it('degrades mid-session when the backing store starts failing', () => {
    const backing = createMemoryStorage();
    let broken = false;
    const flaky: KeyValueStorage = {
      getItem: (k) => backing.getItem(k),
      setItem: (k, v) => {
        if (broken) throw new Error('quota');
        backing.setItem(k, v);
      },
      removeItem: (k) => backing.removeItem(k),
    };
    const s = createSafeStorage(() => flaky);
    expect(s.persistent()).toBe(true);
    broken = true;
    s.setItem('x', '1');
    expect(s.persistent()).toBe(false);
    expect(s.getItem('x')).toBe('1');
  });
  it('repositories work with no persistent storage at all', async () => {
    const { repos } = setup(createSafeStorage(() => null));
    expect(repos.isPersistent()).toBe(false);
    expect((await repos.leads.list()).length).toBe(5);
  });
});

describe('memory repositories', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('seeds on first load and persists to storage', async () => {
    expect(ctx.storage.getItem(DATA_KEY)).toContain('"schema":1');
    expect(await ctx.repos.projects.list()).toHaveLength(8);
  });
  it('reloads persisted writes in a new instance', async () => {
    await ctx.repos.tasks.setDone('demo-tsk-1', true);
    const again = createMemoryRepositories({ storage: ctx.storage, now: () => NOW });
    expect((await again.tasks.listAll()).find((t) => t.id === 'demo-tsk-1')?.done).toBe(true);
  });
  it('re-seeds over corrupt or outdated data', async () => {
    ctx.storage.setItem(DATA_KEY, '{broken');
    expect(await createMemoryRepositories({ storage: ctx.storage, now: () => NOW }).leads.list()).toHaveLength(5);
    ctx.storage.setItem(DATA_KEY, JSON.stringify({ schema: 0, data: {} }));
    expect(await createMemoryRepositories({ storage: ctx.storage, now: () => NOW }).leads.list()).toHaveLength(5);
  });
  it('returns copies: mutating a result does not change the store', async () => {
    const [first] = await ctx.repos.projects.list();
    if (!first) throw new Error('seed empty');
    (first as { title: string }).title = 'hacked';
    expect((await ctx.repos.projects.get(first.id))?.title).not.toBe('hacked');
  });
  it('notifies subscribers on writes and stops after unsubscribe', async () => {
    let calls = 0;
    const off = ctx.repos.subscribe(() => (calls += 1));
    await ctx.repos.tasks.setDone('demo-tsk-1', true);
    off();
    await ctx.repos.tasks.setDone('demo-tsk-1', false);
    expect(calls).toBe(1);
  });
  it('resetDemo restores the seed', async () => {
    await ctx.repos.tasks.create({ projectId: 'demo-prj-1', title: 'חדשה', dueDate: null });
    expect(await ctx.repos.tasks.listAll()).toHaveLength(11);
    await ctx.repos.resetDemo();
    expect(await ctx.repos.tasks.listAll()).toHaveLength(10);
  });

  describe('leads', () => {
    const row: StudioLeadRow = {
      id: 'site-lead-1',
      created_at: NOW,
      source: 'contact',
      name: 'פונה חדש לדוגמה',
      contact: 'new@example.invalid',
      contact_type: 'email',
      need: 'video',
      details: 'עריכה',
      brief: null,
      privacy_consent: true,
      marketing_opt_in: false,
      notice_version: 'v',
      consent_at: NOW,
      status: 'new',
    };
    it('ingests site rows idempotently', async () => {
      await ctx.repos.leads.ingest(row);
      await ctx.repos.leads.ingest(row);
      expect((await ctx.repos.leads.list()).filter((l) => l.id === 'site-lead-1')).toHaveLength(1);
    });
    it('rejects invalid rows with the failing fields', async () => {
      await expect(ctx.repos.leads.ingest({ ...row, id: 'x', need: 'bogus' })).rejects.toMatchObject({ name: 'ValidationError', fields: ['need'] });
    });
    it('converts a lead into a client + project atomically', async () => {
      const plan = await ctx.repos.leads.convert('demo-lead-1', { projectTitle: 'קליפ חדש', kind: 'clip', startStage: 'inquiry', existingClientId: null });
      expect((await ctx.repos.leads.get('demo-lead-1'))?.status).toBe('converted');
      expect(await ctx.repos.clients.get(plan.client?.id ?? '')).not.toBeNull();
      const project = await ctx.repos.projects.get(plan.project.id);
      expect(project?.stage).toBe('inquiry');
      expect(await ctx.repos.milestones.listByProject(plan.project.id)).toHaveLength(1);
      await expect(ctx.repos.leads.setStatus('demo-lead-1', 'new')).rejects.toBeInstanceOf(ValidationError);
    });
    it('conversion to a missing client writes nothing', async () => {
      const before = await ctx.repos.snapshot();
      await expect(
        ctx.repos.leads.convert('demo-lead-1', { projectTitle: 'x', kind: 'clip', startStage: 'inquiry', existingClientId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(await ctx.repos.snapshot()).toEqual(before);
    });
    it('status changes and not-found', async () => {
      expect((await ctx.repos.leads.setStatus('demo-lead-2', 'replied')).status).toBe('replied');
      await expect(ctx.repos.leads.setStatus('nope', 'closed')).rejects.toBeInstanceOf(NotFoundError);
      expect(await ctx.repos.leads.get('nope')).toBeNull();
    });
  });

  describe('projects', () => {
    it('moves one stage at a time and records history', async () => {
      const moved = await ctx.repos.projects.move('demo-prj-8', 'proposal');
      expect(moved.stage).toBe('proposal');
      expect(moved.stageHistory.at(-1)?.from).toBe('inquiry');
    });
    it('refuses illegal moves with a Hebrew message', async () => {
      await expect(ctx.repos.projects.move('demo-prj-8', 'delivered')).rejects.toThrow(/אי אפשר להעביר/);
    });
    it('filters by client and validates updates', async () => {
      expect((await ctx.repos.projects.listByClient('demo-cli-a')).map((p) => p.id).sort()).toEqual(['demo-prj-1', 'demo-prj-6']);
      await expect(ctx.repos.projects.update('demo-prj-1', { title: ' ' })).rejects.toBeInstanceOf(ValidationError);
      await expect(ctx.repos.projects.update('demo-prj-1', { dueDate: '2026-13-01' })).rejects.toBeInstanceOf(ValidationError);
      expect((await ctx.repos.projects.update('demo-prj-1', { title: 'שם חדש' })).title).toBe('שם חדש');
    });
  });

  describe('tasks and milestones', () => {
    it('creates, validates and completes tasks', async () => {
      const t = await ctx.repos.tasks.create({ projectId: 'demo-prj-2', title: '  משימה  ', dueDate: '2026-10-30' });
      expect(t.title).toBe('משימה');
      expect((await ctx.repos.tasks.setDone(t.id, true)).doneAt).toBe(NOW);
      await expect(ctx.repos.tasks.create({ projectId: 'demo-prj-2', title: '', dueDate: null })).rejects.toBeInstanceOf(ValidationError);
      await expect(ctx.repos.tasks.create({ projectId: 'nope', title: 'x', dueDate: null })).rejects.toBeInstanceOf(NotFoundError);
      const list = await ctx.repos.tasks.listByProject('demo-prj-2');
      expect(list.at(-1)?.done).toBe(true); // done tasks sink
    });
    it('creates milestones sorted by date', async () => {
      await ctx.repos.milestones.create({ projectId: 'demo-prj-2', title: 'מוקדם', date: '2026-10-25', clientVisible: true });
      const list = await ctx.repos.milestones.listByProject('demo-prj-2');
      expect(list[0]?.title).toBe('מוקדם');
      await expect(ctx.repos.milestones.create({ projectId: 'demo-prj-2', title: 'x', date: 'bad', clientVisible: false })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect((await ctx.repos.milestones.setDone(list[0]?.id ?? '', true)).done).toBe(true);
    });
  });

  describe('quotes', () => {
    it('drafts, edits, sends, accepts and records payments', async () => {
      const draft = await ctx.repos.quotes.createDraft('demo-prj-8');
      expect(draft.status).toBe('draft');
      expect(draft.clientId).toBe('demo-cli-h');
      await expect(ctx.repos.quotes.setStatus(draft.id, 'sent')).rejects.toBeInstanceOf(ValidationError); // empty line
      const saved = await ctx.repos.quotes.saveDraft(draft.id, {
        title: 'טיזר',
        lines: [{ id: 'l1', description: 'עריכה', quantity: 1, unitPrice: 250_000 }],
        discount: 0,
        validUntil: '2026-11-07',
      });
      expect(quoteTotals(saved).total).toBe(295_000);
      const sent = await ctx.repos.quotes.setStatus(draft.id, 'sent');
      expect(sent.sentAt).toBe(NOW);
      await expect(ctx.repos.quotes.saveDraft(draft.id, { title: 'x', lines: [], discount: 0, validUntil: null })).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(ctx.repos.quotes.recordPayment(draft.id, 100)).rejects.toBeInstanceOf(ValidationError);
      await ctx.repos.quotes.setStatus(draft.id, 'accepted');
      await expect(ctx.repos.quotes.recordPayment(draft.id, 10.5)).rejects.toBeInstanceOf(ValidationError);
      expect((await ctx.repos.quotes.recordPayment(draft.id, 100_000)).paid).toBe(100_000);
    });
    it('rejects float amounts in drafts', async () => {
      await expect(
        ctx.repos.quotes.saveDraft('demo-q-5', { title: 'x', lines: [{ id: 'a', description: 'd', quantity: 1, unitPrice: 1.5 }], discount: 0, validUntil: null }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
    it('attaches payment links and invoices', async () => {
      expect((await ctx.repos.quotes.attachPaymentLink('demo-q-2', 'pay-1')).paymentLinkId).toBe('pay-1');
      const inv = { documentNumber: 'D-1', issuedAt: NOW, allocationStatus: 'granted' as const, allocationNumber: 'A-1' };
      expect((await ctx.repos.quotes.attachInvoice('demo-q-2', inv)).invoice).toEqual(inv);
      await expect(ctx.repos.quotes.attachInvoice('demo-q-4', inv)).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('assets', () => {
    it('bundles versions newest first with comments by timecode', async () => {
      const bundles = await ctx.repos.assets.listByProject('demo-prj-1');
      expect(bundles).toHaveLength(1);
      expect(bundles[0]?.versions.map((v) => v.number)).toEqual([2, 1]);
      expect(bundles[0]?.versions[0]?.comments.map((c) => c.timecodeMs)).toEqual([95_500, 141_040, 141_040]);
      expect(await ctx.repos.assets.listDeliveries('demo-prj-6')).toHaveLength(1);
    });
  });
});
