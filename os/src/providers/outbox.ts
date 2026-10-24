import type { KeyValueStorage } from '../data/storage';

export type ProviderName = 'email' | 'storage' | 'video' | 'payment' | 'invoicing';

export interface OutboxEntry {
  readonly id: string;
  readonly at: string;
  readonly provider: ProviderName;
  readonly action: string;
  /** One Hebrew line describing what WOULD have happened with a real provider. */
  readonly summary: string;
  /** The exact request the real adapter would receive. */
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface Outbox {
  list(): OutboxEntry[];
  record(entry: Omit<OutboxEntry, 'id' | 'at'>): OutboxEntry;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export const OUTBOX_KEY = 'studio-os:outbox';
const MAX_ENTRIES = 200;

/**
 * Where mock providers "send" things. Nothing leaves the browser; the owner sees every
 * would-be email, upload, payment link and invoice in the Outbox screen.
 */
export function createOutbox(opts: { storage: KeyValueStorage; now?: () => string; newId?: () => string }): Outbox {
  const now = opts.now ?? (() => new Date().toISOString());
  let counter = 0;
  const newId = opts.newId ?? (() => `out-${Date.now().toString(36)}-${String((counter += 1))}`);
  const listeners = new Set<() => void>();
  let entries: OutboxEntry[] = [];
  try {
    const raw = opts.storage.getItem(OUTBOX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    entries = Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    entries = [];
  }
  const save = () => {
    opts.storage.setItem(OUTBOX_KEY, JSON.stringify(entries));
    for (const l of listeners) l();
  };
  return {
    list: () => entries.slice(),
    record: (entry) => {
      const full: OutboxEntry = { ...entry, id: newId(), at: now() };
      entries = [full, ...entries].slice(0, MAX_ENTRIES);
      save();
      return full;
    },
    clear: () => {
      entries = [];
      save();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
