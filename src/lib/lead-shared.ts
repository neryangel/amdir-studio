// Shared by the browser form (src/components/ContactForm.astro) and the server function (server/lead/*).
// Bump NOTICE_VERSION whenever the collection notice text above the submit button changes:
// every stored lead records which notice version the person saw.
export const NOTICE_VERSION = 'lead-notice-2026-10-23';

export const LEAD_NEEDS = ['clip', 'video', 'ai', 'web', 'pilot', 'other'] as const;
export type LeadNeed = (typeof LEAD_NEEDS)[number];

export const LEAD_SOURCES = ['contact', 'pilot'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Time-trap: a submission sooner than this after the form token was issued is rejected. */
export const MIN_FILL_MS = 3000;
/** Tokens older than this are rejected (the page was left open too long). */
export const MAX_TOKEN_AGE_MS = 6 * 60 * 60 * 1000;

export const LIMITS = {
  name: 120,
  contact: 200,
  details: 4000,
  bodyBytes: 16 * 1024,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s\-()]{9,20}$/;

export function contactKind(value: string): 'email' | 'phone' | null {
  const v = value.trim();
  if (EMAIL.test(v)) return 'email';
  if (PHONE.test(v) && v.replace(/\D/g, '').length >= 9) return 'phone';
  return null;
}

// ---------- Need-specific brief (all fields optional) ----------
export const SITE_GOALS = ['leads', 'brand', 'sales', 'other'] as const;
export type SiteGoal = (typeof SITE_GOALS)[number];
export const SITE_GOAL_LABEL: Record<SiteGoal, string> = {
  leads: 'פניות מלקוחות',
  brand: 'תדמית',
  sales: 'מכירה',
  other: 'אחר',
};

export const EVENTS_PER_YEAR = ['1-10', '11-30', '31-60', '61+'] as const;
export type EventsPerYear = (typeof EVENTS_PER_YEAR)[number];
export const EVENTS_PER_YEAR_LABEL: Record<EventsPerYear, string> = {
  '1-10': 'עד 10',
  '11-30': '11 עד 30',
  '31-60': '31 עד 60',
  '61+': 'יותר מ-60',
};

/** Which brief fields belong to which need. The server rejects fields from another group. */
export const BRIEF_GROUPS = {
  media: { needs: ['clip', 'video', 'ai'], fields: ['songUrl', 'releaseDate', 'referenceUrl'] },
  web: { needs: ['web'], fields: ['currentSiteUrl', 'siteGoal', 'desiredDate'] },
  pilot: { needs: ['pilot'], fields: ['eventsPerYear', 'currentTools'] },
} as const satisfies Record<string, { needs: readonly LeadNeed[]; fields: readonly string[] }>;
export type BriefGroup = keyof typeof BRIEF_GROUPS;
export type BriefField = (typeof BRIEF_GROUPS)[BriefGroup]['fields'][number];

export const BRIEF_FIELD_LABEL: Record<BriefField, string> = {
  songUrl: 'קישור לשיר או לחומר',
  releaseDate: 'תאריך יציאה משוער',
  referenceUrl: 'סגנון או רפרנס',
  currentSiteUrl: 'אתר קיים',
  siteGoal: 'המטרה העיקרית',
  desiredDate: 'מועד רצוי',
  eventsPerYear: 'אירועים בשנה',
  currentTools: 'כלים היום',
};

export const BRIEF_LIMITS = { url: 500, text: 300 } as const;

export function briefGroupFor(need: string): BriefGroup | null {
  for (const [group, def] of Object.entries(BRIEF_GROUPS) as [BriefGroup, (typeof BRIEF_GROUPS)[BriefGroup]][]) {
    if ((def.needs as readonly string[]).includes(need)) return group;
  }
  return null;
}

/** http(s) only: rejects javascript:, data:, ftp: and anything that does not parse. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** YYYY-MM or YYYY-MM-DD (what <input type="month"> / type="date" produce). */
export const MONTH_OR_DATE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
