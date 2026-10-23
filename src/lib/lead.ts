// THE single place where a form submission leaves the browser.
// Today there is no backend, so submitLead() never reports success.
//
// To connect a real endpoint later (Supabase Edge Function, Resend, etc.):
//   1. set PUBLIC_LEAD_ENDPOINT in .env (read below as LEAD_ENDPOINT)
//   2. make that endpoint validate the same fields server-side, store the lead,
//      and respond { ok: true } only AFTER it was stored.
//   3. add the endpoint's origin to the CSP `connect-src`.
// Nothing else in the UI has to change: ContactForm already renders success
// only when this function returns { ok: true }.

export interface LeadPayload {
  form: 'contact' | 'pilot';
  name: string;
  /** Phone or email, as typed. */
  reach: string;
  need: string;
  details: string;
  /** Required checkbox: agreed to the privacy policy. */
  privacyConsent: true;
  /** Separate, optional, never pre-ticked. */
  marketingOptIn: boolean;
  /** ISO timestamp, client side (the server should set its own too). */
  submittedAt: string;
}

export type SubmitResult = { ok: true } | { ok: false; reason: 'not-connected' | 'network' | 'server' };

const LEAD_ENDPOINT: string | undefined = import.meta.env.PUBLIC_LEAD_ENDPOINT || undefined;

export async function submitLead(payload: LeadPayload): Promise<SubmitResult> {
  if (!LEAD_ENDPOINT) return { ok: false, reason: 'not-connected' };
  try {
    const res = await fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, reason: 'server' };
    const body: unknown = await res.json().catch(() => null);
    return body && typeof body === 'object' && (body as { ok?: unknown }).ok === true
      ? { ok: true }
      : { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s\-()]{9,16}$/;

export function isReach(value: string): boolean {
  const v = value.trim();
  return EMAIL.test(v) || (PHONE.test(v) && v.replace(/\D/g, '').length >= 9);
}
