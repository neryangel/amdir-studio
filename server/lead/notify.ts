// Notification adapters. Notification happens only AFTER the lead is stored.
import type { LeadRecord } from './store';
import { BRIEF_FIELD_LABEL, EVENTS_PER_YEAR_LABEL, SITE_GOAL_LABEL } from '../../src/lib/lead-shared';

export interface Notifier {
  readonly kind: string;
  notify(id: string, record: LeadRecord): Promise<void>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const NEED_LABEL: Record<string, string> = {
  clip: 'קליפ לשיר',
  video: 'עריכה, מושן או אפקטים',
  ai: 'קליפ או תמונות ב-AI',
  web: 'אתר',
  pilot: 'פיילוט Event Pro Studio',
  other: 'משהו אחר',
};

/** Resend REST API via fetch. Sends to the studio owner only (never to the visitor). */
export class ResendNotifier implements Notifier {
  readonly kind = 'resend';
  constructor(private readonly opts: { apiKey: string; from: string; to: string; fetch?: FetchLike; timeoutMs?: number }) {}

  async notify(id: string, r: LeadRecord): Promise<void> {
    const { apiKey, from, to, fetch: f = fetch, timeoutMs = 8000 } = this.opts;
    const text = [
      `פנייה חדשה (${r.source === 'pilot' ? 'פיילוט' : 'טופס יצירת קשר'})`,
      `שם: ${r.name}`,
      `${r.contact_type === 'email' ? 'אימייל' : 'טלפון'}: ${r.contact}`,
      `במה אפשר לעזור: ${NEED_LABEL[r.need] ?? r.need}`,
      `עדכונים: ${r.marketing_opt_in ? 'כן' : 'לא'}`,
      ...Object.entries(r.brief ?? {}).map(([k, v]) => {
        const label = BRIEF_FIELD_LABEL[k as keyof typeof BRIEF_FIELD_LABEL] ?? k;
        const value =
          k === 'siteGoal'
            ? (SITE_GOAL_LABEL[v as keyof typeof SITE_GOAL_LABEL] ?? v)
            : k === 'eventsPerYear'
              ? (EVENTS_PER_YEAR_LABEL[v as keyof typeof EVENTS_PER_YEAR_LABEL] ?? v)
              : v;
        return `${label}: ${value}`;
      }),
      '',
      r.details,
      '',
      `מזהה: ${id}`,
    ].join('\n');
    const res = await f('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `lead-${id}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `פנייה חדשה מהאתר: ${NEED_LABEL[r.need] ?? r.need}`,
        text,
        ...(r.contact_type === 'email' ? { reply_to: r.contact } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`resend failed: HTTP ${res.status}`);
  }
}

export class NoopNotifier implements Notifier {
  readonly kind = 'noop';
  async notify(): Promise<void> {}
}
