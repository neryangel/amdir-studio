// THE single place where a form submission leaves the browser.
//
// PUBLIC_LEAD_ENDPOINT unset  → submitLead() returns { ok:false, reason:'not-connected' } (honest message, no fake success)
// PUBLIC_LEAD_ENDPOINT=/api/lead → GET it once for a signed render token (time-trap), then POST JSON.
// The server (api/lead.ts → server/lead/handler.ts) answers 200 { ok:true, id } only AFTER the lead was stored.
import { NOTICE_VERSION, contactKind, type BriefField, type LeadNeed, type LeadSource } from './lead-shared';

export const LEAD_ENDPOINT: string | undefined = import.meta.env.PUBLIC_LEAD_ENDPOINT || undefined;

export interface LeadPayload {
  source: LeadSource;
  name: string;
  /** Phone or email, as typed. */
  contact: string;
  need: LeadNeed;
  details: string;
  /** Required checkbox: agreed to the privacy policy. */
  privacyConsent: true;
  /** Separate, optional, never pre-ticked. */
  marketingOptIn: boolean;
  /** Honeypot. People never see it, so it stays empty. */
  website: string;
  /** Optional need-specific extras (only the visible group, only non-empty values). */
  brief?: Partial<Record<BriefField, string>>;
}

export type FailReason = 'not-connected' | 'network' | 'server' | 'too-fast' | 'invalid' | 'rate-limited';
export type SubmitResult = { ok: true; id: string } | { ok: false; reason: FailReason; fields?: string[] };

let tokenPromise: Promise<string | undefined> | undefined;

function fetchToken(endpoint: string): Promise<string | undefined> {
  return fetch(endpoint, { headers: { accept: 'application/json' }, cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<{ token?: unknown }>) : null))
    .then((b) => (b && typeof b.token === 'string' ? b.token : undefined))
    .catch(() => undefined);
}

/** Call when the form is rendered: starts the time-trap clock. */
export function prefetchToken(): void {
  if (LEAD_ENDPOINT) tokenPromise ??= fetchToken(LEAD_ENDPOINT);
}

export async function submitLead(payload: LeadPayload): Promise<SubmitResult> {
  if (!LEAD_ENDPOINT) return { ok: false, reason: 'not-connected' };
  prefetchToken();
  let token = await tokenPromise;
  if (!token) {
    tokenPromise = fetchToken(LEAD_ENDPOINT);
    token = await tokenPromise;
    if (!token) return { ok: false, reason: 'network' };
  }
  let res: Response;
  try {
    res = await fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ...payload, token, noticeVersion: NOTICE_VERSION }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string; fields?: string[] } | null;
  if (res.ok && body?.ok === true && body.id) return { ok: true, id: body.id };
  if (res.status === 429) return { ok: false, reason: 'rate-limited' };
  if (res.status === 400 && body?.error === 'too_fast') return { ok: false, reason: 'too-fast' };
  if (res.status === 400 && body?.error === 'invalid') return { ok: false, reason: 'invalid', fields: body.fields ?? [] };
  if (res.status === 400 && body?.error === 'token') tokenPromise = undefined;
  return { ok: false, reason: 'server' };
}

export function isReach(value: string): boolean {
  return contactKind(value) !== null;
}
