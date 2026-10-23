// Storage adapters. The handler only knows the LeadStore interface.
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
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Supabase PostgREST insert via plain fetch (no SDK).
 * Server-only: uses a secret/service key that bypasses RLS. Never expose it to the browser.
 */
export class SupabaseRestStore implements LeadStore {
  readonly kind = 'supabase';
  constructor(
    private readonly opts: { url: string; serviceKey: string; table?: string; fetch?: FetchLike; timeoutMs?: number },
  ) {}

  async insert(record: LeadRecord): Promise<{ id: string }> {
    const { url, serviceKey, table = 'studio_leads', fetch: f = fetch, timeoutMs = 8000 } = this.opts;
    const headers: Record<string, string> = {
      apikey: serviceKey,
      'content-type': 'application/json',
      prefer: 'return=representation',
    };
    // Legacy JWT keys also go in Authorization. New sb_secret_ keys are not JWTs and go in apikey only.
    if (serviceKey.startsWith('eyJ')) headers.authorization = `Bearer ${serviceKey}`;
    const res = await f(`${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}?select=id`, {
      method: 'POST',
      headers,
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`supabase insert failed: HTTP ${res.status}`);
    const rows: unknown = await res.json();
    const id = Array.isArray(rows) ? (rows[0] as { id?: unknown } | undefined)?.id : undefined;
    if (typeof id !== 'string' && typeof id !== 'number') throw new Error('supabase insert returned no id');
    return { id: String(id) };
  }
}

/** Store that always fails: used when no storage is configured, so the form never fakes success. */
export class UnconfiguredStore implements LeadStore {
  readonly kind = 'unconfigured';
  async insert(): Promise<{ id: string }> {
    throw new Error('lead store is not configured');
  }
}
