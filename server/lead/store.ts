// Storage adapters. The handler only knows the LeadStore interface.

/**
 * Per-call timeouts. count + store + notify run in sequence and must fit, with margin, inside
 * `maxDuration: 10` (s) for api/lead.ts in vercel.json, so a stored lead is never reported as a failure.
 */
export const TIMEOUT_MS = { count: 1500, store: 4000, notify: 3000 } as const;

export interface LeadRecord {
  source: 'contact' | 'pilot';
  name: string;
  contact: string;
  contact_type: 'email' | 'phone';
  need: string;
  details: string;
  /** Need-specific extras (jsonb), null when none were given. */
  brief: Record<string, string> | null;
  /** Consent record (see supabase/leads.sql). */
  privacy_consent: true;
  marketing_opt_in: boolean;
  notice_version: string;
  consent_at: string;
  ip_hash: string;
}

export interface LeadStore {
  readonly kind: string;
  /** Resolves with the stored row id. Must throw if the row was not stored. */
  insert(record: LeadRecord): Promise<{ id: string }>;
  /** Number of stored leads with this ip_hash created at or after `sinceIso` (durable rate limit). */
  countRecent(ipHash: string, sinceIso: string): Promise<number>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Supabase PostgREST insert + count via plain fetch (no SDK).
 * Server-only: uses a secret/service key that bypasses RLS. Never expose it to the browser.
 */
export class SupabaseRestStore implements LeadStore {
  readonly kind = 'supabase';
  constructor(
    private readonly opts: {
      url: string;
      serviceKey: string;
      table?: string;
      fetch?: FetchLike;
      timeoutMs?: number;
      countTimeoutMs?: number;
    },
  ) {}

  private headers(extra: Record<string, string>): Record<string, string> {
    const { serviceKey } = this.opts;
    const headers: Record<string, string> = { apikey: serviceKey, ...extra };
    // Legacy JWT keys also go in Authorization. New sb_secret_ keys are not JWTs and go in apikey only.
    if (serviceKey.startsWith('eyJ')) headers.authorization = `Bearer ${serviceKey}`;
    return headers;
  }

  private endpoint(): string {
    const { url, table = 'studio_leads' } = this.opts;
    return `${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}`;
  }

  async insert(record: LeadRecord): Promise<{ id: string }> {
    const { fetch: f = fetch, timeoutMs = TIMEOUT_MS.store } = this.opts;
    const res = await f(`${this.endpoint()}?select=id`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json', prefer: 'return=representation' }),
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`supabase insert failed: HTTP ${res.status}`);
    const rows: unknown = await res.json();
    const id = Array.isArray(rows) ? (rows[0] as { id?: unknown } | undefined)?.id : undefined;
    if (typeof id !== 'string' && typeof id !== 'number') throw new Error('supabase insert returned no id');
    return { id: String(id) };
  }

  /** HEAD with `Prefer: count=exact`: PostgREST answers `Content-Range: *\/<n>` without returning rows. */
  async countRecent(ipHash: string, sinceIso: string): Promise<number> {
    const { fetch: f = fetch, countTimeoutMs = TIMEOUT_MS.count } = this.opts;
    const q = `select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${encodeURIComponent(sinceIso)}`;
    const res = await f(`${this.endpoint()}?${q}`, {
      method: 'HEAD',
      headers: this.headers({ prefer: 'count=exact' }),
      signal: AbortSignal.timeout(countTimeoutMs),
    });
    if (!res.ok) throw new Error(`supabase count failed: HTTP ${res.status}`);
    const total = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '')?.[1];
    if (total === undefined) throw new Error('supabase count returned no total');
    return Number(total);
  }
}

/** Store that always fails: used when no storage is configured, so the form never fakes success. */
export class UnconfiguredStore implements LeadStore {
  readonly kind = 'unconfigured';
  async insert(): Promise<{ id: string }> {
    throw new Error('lead store is not configured');
  }
  async countRecent(): Promise<number> {
    return 0;
  }
}
