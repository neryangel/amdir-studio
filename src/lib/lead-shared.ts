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
