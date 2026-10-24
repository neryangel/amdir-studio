import { leadFromStudioRow, planLeadConversion } from '../domain/lead';
import { canChangeQuoteStatus, validateQuoteForSending } from '../domain/quote';
import { israelDate, addDays, isIsoDate } from '../domain/dates';
import { canMove, moveProject, STAGE_LABEL } from '../domain/stages';
import type { IsoDateTime, Quote } from '../domain/types';
import type { AssetBundle, Repositories, StudioSnapshot } from './repositories';
import { NotFoundError, ValidationError } from './repositories';
import { buildDemoSeed } from './seed';
import type { KeyValueStorage } from './storage';

export const DATA_KEY = 'studio-os:data';
export const SCHEMA_VERSION = 1;

interface Persisted {
  readonly schema: number;
  readonly seededAt: IsoDateTime;
  readonly data: StudioSnapshot;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? U[] : T[K] };
type DB = Mutable<StudioSnapshot>;

export interface MemoryRepositoryOptions {
  readonly storage: KeyValueStorage & { persistent?: () => boolean };
  readonly now?: () => IsoDateTime;
  readonly newId?: (prefix: string) => string;
  /** Seed factory; defaults to the deterministic demo seed. */
  readonly seed?: (now: IsoDateTime) => StudioSnapshot;
}

function defaultId(prefix: string): string {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${uuid}`;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function isSnapshot(v: unknown): v is StudioSnapshot {
  if (!v || typeof v !== 'object') return false;
  const keys: (keyof StudioSnapshot)[] = ['leads', 'clients', 'projects', 'tasks', 'milestones', 'quotes', 'assets', 'versions', 'comments', 'deliveries'];
  return keys.every((k) => Array.isArray((v as Record<string, unknown>)[k]));
}

/**
 * In-memory repositories persisted to a key/value storage (localStorage in the browser).
 * Reads return deep copies, so callers can never mutate the store by accident.
 */
export function createMemoryRepositories(opts: MemoryRepositoryOptions): Repositories {
  const now = opts.now ?? (() => new Date().toISOString());
  const newId = opts.newId ?? defaultId;
  const seed = opts.seed ?? buildDemoSeed;
  const listeners = new Set<() => void>();

  const load = (): DB => {
    const raw = opts.storage.getItem(DATA_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        if (parsed.schema === SCHEMA_VERSION && isSnapshot(parsed.data)) return clone(parsed.data) as DB;
      } catch {
        // Corrupt data: fall through and re-seed.
      }
    }
    const fresh = seed(now()) as DB;
    persist(fresh);
    return fresh;
  };
  const persist = (data: DB) => {
    const payload: Persisted = { schema: SCHEMA_VERSION, seededAt: now(), data };
    opts.storage.setItem(DATA_KEY, JSON.stringify(payload));
  };

  let db: DB = load();

  const commit = () => {
    persist(db);
    for (const l of listeners) l();
  };
  const find = <T extends { id: string }>(list: T[], id: string, entity: string): T => {
    const item = list.find((x) => x.id === id);
    if (!item) throw new NotFoundError(entity, id);
    return item;
  };
  const replace = <T extends { id: string }>(list: T[], next: T): T => {
    const i = list.findIndex((x) => x.id === next.id);
    if (i === -1) list.push(next);
    else list[i] = next;
    return clone(next);
  };
  const byNewest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);
  // Async boundary: callers always get a promise, like a network adapter.
  const tick = <T>(fn: () => T): Promise<T> =>
    Promise.resolve().then(() => {
      const result = fn();
      return result;
    });
  const write = <T>(fn: () => T): Promise<T> =>
    tick(() => {
      const result = fn();
      commit();
      return result;
    });

  const editableQuote = (id: string): Quote => {
    const q = find(db.quotes, id, 'quote');
    if (q.status !== 'draft') throw new ValidationError('Only draft quotes can be edited', ['status']);
    return q;
  };

  return {
    leads: {
      list: () => tick(() => clone(db.leads).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))),
      get: (id) => tick(() => clone(db.leads.find((l) => l.id === id) ?? null)),
      ingest: (row) =>
        write(() => {
          const existing = db.leads.find((l) => l.id === row.id);
          if (existing) return clone(existing);
          const res = leadFromStudioRow(row, { demo: true });
          if (!res.ok) throw new ValidationError('Lead row is invalid', res.errors);
          return replace(db.leads, res.lead);
        }),
      setStatus: (id, status) =>
        write(() => {
          const lead = find(db.leads, id, 'lead');
          if (lead.status === 'converted') throw new ValidationError('A converted lead cannot change status', ['status']);
          return replace(db.leads, { ...lead, status, updatedAt: now() });
        }),
      convert: (id, input) =>
        write(() => {
          const lead = find(db.leads, id, 'lead');
          if (input.existingClientId) find(db.clients, input.existingClientId, 'client');
          const plan = planLeadConversion(lead, input, { now: now(), newId });
          if (plan.client) db.clients.push(plan.client);
          db.projects.push(plan.project);
          db.milestones.push(...plan.milestones);
          replace(db.leads, plan.lead);
          return clone(plan);
        }),
    },

    clients: {
      list: () => tick(() => clone(db.clients).sort((a, b) => a.name.localeCompare(b.name, 'he'))),
      get: (id) => tick(() => clone(db.clients.find((c) => c.id === id) ?? null)),
      update: (id, patch) =>
        write(() => {
          const c = find(db.clients, id, 'client');
          if (patch.name !== undefined && !patch.name.trim()) throw new ValidationError('Client name is required', ['name']);
          return replace(db.clients, { ...c, ...patch, updatedAt: now() });
        }),
    },

    projects: {
      list: () => tick(() => clone(db.projects).sort(byNewest)),
      get: (id) => tick(() => clone(db.projects.find((p) => p.id === id) ?? null)),
      listByClient: (clientId) => tick(() => clone(db.projects.filter((p) => p.clientId === clientId)).sort(byNewest)),
      move: (id, to) =>
        write(() => {
          const p = find(db.projects, id, 'project');
          if (!canMove(p, to)) throw new ValidationError(`אי אפשר להעביר מ״${STAGE_LABEL[p.stage]}״ ל״${STAGE_LABEL[to]}״`, ['stage']);
          return replace(db.projects, moveProject(p, to, now()));
        }),
      update: (id, patch) =>
        write(() => {
          const p = find(db.projects, id, 'project');
          if (patch.title !== undefined && !patch.title.trim()) throw new ValidationError('Project title is required', ['title']);
          if (patch.dueDate && !isIsoDate(patch.dueDate)) throw new ValidationError('Invalid due date', ['dueDate']);
          return replace(db.projects, { ...p, ...patch, updatedAt: now() });
        }),
    },

    tasks: {
      listAll: () => tick(() => clone(db.tasks)),
      listByProject: (projectId) =>
        tick(() =>
          clone(db.tasks.filter((t) => t.projectId === projectId)).sort(
            (a, b) => Number(a.done) - Number(b.done) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
          ),
        ),
      create: ({ projectId, title, dueDate }) =>
        write(() => {
          find(db.projects, projectId, 'project');
          if (!title.trim()) throw new ValidationError('Task title is required', ['title']);
          if (dueDate && !isIsoDate(dueDate)) throw new ValidationError('Invalid due date', ['dueDate']);
          const at = now();
          return replace(db.tasks, { id: newId('tsk'), demo: true, createdAt: at, updatedAt: at, projectId, title: title.trim(), dueDate, done: false, doneAt: null });
        }),
      setDone: (id, done) =>
        write(() => {
          const t = find(db.tasks, id, 'task');
          const at = now();
          return replace(db.tasks, { ...t, done, doneAt: done ? at : null, updatedAt: at });
        }),
    },

    milestones: {
      listAll: () => tick(() => clone(db.milestones)),
      listByProject: (projectId) => tick(() => clone(db.milestones.filter((m) => m.projectId === projectId)).sort((a, b) => a.date.localeCompare(b.date))),
      create: ({ projectId, title, date, clientVisible }) =>
        write(() => {
          find(db.projects, projectId, 'project');
          if (!title.trim()) throw new ValidationError('Milestone title is required', ['title']);
          if (!isIsoDate(date)) throw new ValidationError('Invalid date', ['date']);
          const at = now();
          return replace(db.milestones, { id: newId('mil'), demo: true, createdAt: at, updatedAt: at, projectId, title: title.trim(), date, done: false, clientVisible });
        }),
      setDone: (id, done) =>
        write(() => {
          const m = find(db.milestones, id, 'milestone');
          return replace(db.milestones, { ...m, done, updatedAt: now() });
        }),
    },

    quotes: {
      listAll: () => tick(() => clone(db.quotes)),
      listByProject: (projectId) => tick(() => clone(db.quotes.filter((q) => q.projectId === projectId)).sort(byNewest)),
      get: (id) => tick(() => clone(db.quotes.find((q) => q.id === id) ?? null)),
      createDraft: (projectId) =>
        write(() => {
          const p = find(db.projects, projectId, 'project');
          const at = now();
          const today = israelDate(at);
          const seq = db.quotes.length + 1;
          return replace(db.quotes, {
            id: newId('q'),
            demo: true,
            createdAt: at,
            updatedAt: at,
            projectId,
            clientId: p.clientId,
            number: `Q-${today.slice(0, 4)}-${String(seq).padStart(3, '0')}`,
            title: p.title,
            lines: [{ id: newId('ln'), description: '', quantity: 1, unitPrice: 0 }],
            discount: 0,
            vatRate: 1800,
            status: 'draft',
            issuedOn: today,
            validUntil: addDays(today, 14),
            sentAt: null,
            acceptedAt: null,
            paid: 0,
            paymentLinkId: null,
            invoice: null,
          });
        }),
      saveDraft: (id, input) =>
        write(() => {
          const q = editableQuote(id);
          for (const l of input.lines) {
            if (!Number.isSafeInteger(l.unitPrice)) throw new ValidationError('Unit price must be agorot', ['unitPrice']);
          }
          if (!Number.isSafeInteger(input.discount)) throw new ValidationError('Discount must be agorot', ['discount']);
          if (input.validUntil && !isIsoDate(input.validUntil)) throw new ValidationError('Invalid date', ['validUntil']);
          return replace(db.quotes, { ...q, title: input.title.trim() || q.title, lines: clone([...input.lines]), discount: input.discount, validUntil: input.validUntil, updatedAt: now() });
        }),
      setStatus: (id, status) =>
        write(() => {
          const q = find(db.quotes, id, 'quote');
          if (!canChangeQuoteStatus(q.status, status)) throw new ValidationError(`Cannot change quote from ${q.status} to ${status}`, ['status']);
          if (status === 'sent') {
            const issues = validateQuoteForSending(q);
            if (issues.length > 0) throw new ValidationError(issues.map((i) => i.message).join(' '), issues.map((i) => i.field));
          }
          const at = now();
          return replace(db.quotes, {
            ...q,
            status,
            sentAt: status === 'sent' ? at : status === 'draft' ? null : q.sentAt,
            acceptedAt: status === 'accepted' ? at : q.acceptedAt,
            updatedAt: at,
          });
        }),
      recordPayment: (id, amount) =>
        write(() => {
          const q = find(db.quotes, id, 'quote');
          if (q.status !== 'accepted') throw new ValidationError('Payments are recorded on accepted quotes only', ['status']);
          if (!Number.isSafeInteger(amount) || amount <= 0) throw new ValidationError('Payment must be a positive agorot amount', ['amount']);
          return replace(db.quotes, { ...q, paid: q.paid + amount, updatedAt: now() });
        }),
      attachPaymentLink: (id, linkId) =>
        write(() => {
          const q = find(db.quotes, id, 'quote');
          return replace(db.quotes, { ...q, paymentLinkId: linkId, updatedAt: now() });
        }),
      attachInvoice: (id, invoice) =>
        write(() => {
          const q = find(db.quotes, id, 'quote');
          if (q.status !== 'accepted') throw new ValidationError('Invoices are issued for accepted quotes only', ['status']);
          return replace(db.quotes, { ...q, invoice, updatedAt: now() });
        }),
    },

    assets: {
      listByProject: (projectId) =>
        tick(() =>
          db.assets
            .filter((a) => a.projectId === projectId)
            .map(
              (asset): AssetBundle => ({
                asset: clone(asset),
                versions: db.versions
                  .filter((v) => v.assetId === asset.id)
                  .sort((a, b) => b.number - a.number)
                  .map((v) => ({ ...clone(v), comments: clone(db.comments.filter((c) => c.versionId === v.id)).sort((a, b) => (a.timecodeMs ?? 0) - (b.timecodeMs ?? 0)) })),
              }),
            ),
        ),
      listDeliveries: (projectId) => tick(() => clone(db.deliveries.filter((d) => d.projectId === projectId))),
    },

    snapshot: () => tick(() => clone(db)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    resetDemo: () =>
      write(() => {
        opts.storage.removeItem(DATA_KEY);
        db = seed(now()) as DB;
      }),
    isPersistent: () => opts.storage.persistent?.() ?? true,
  };
}
