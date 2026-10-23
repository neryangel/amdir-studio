import * as z from 'zod';
import {
  BRIEF_GROUPS,
  BRIEF_LIMITS,
  EVENTS_PER_YEAR,
  LEAD_NEEDS,
  LEAD_SOURCES,
  LIMITS,
  MONTH_OR_DATE,
  SITE_GOALS,
  briefGroupFor,
  contactKind,
  isHttpUrl,
} from '../../src/lib/lead-shared';

const optUrl = z
  .string()
  .trim()
  .max(BRIEF_LIMITS.url)
  .refine(isHttpUrl, { message: 'must be an http(s) URL' })
  .optional();
const optMonth = z.string().trim().regex(MONTH_OR_DATE).optional();

/** Need-specific extras. Every field is optional; unknown keys are rejected. */
export const Brief = z.strictObject({
  songUrl: optUrl,
  releaseDate: optMonth,
  referenceUrl: optUrl,
  currentSiteUrl: optUrl,
  siteGoal: z.enum(SITE_GOALS).optional(),
  desiredDate: optMonth,
  eventsPerYear: z.enum(EVENTS_PER_YEAR).optional(),
  currentTools: z.string().trim().min(1).max(BRIEF_LIMITS.text).optional(),
});
export type Brief = z.infer<typeof Brief>;

/** Exactly the fields the form may send. Unknown keys are rejected (strictObject). */
export const LeadInput = z.strictObject({
  name: z.string().trim().min(1).max(LIMITS.name),
  contact: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.contact)
    .refine((v) => contactKind(v) !== null, { message: 'contact must be a phone number or an email' }),
  need: z.enum(LEAD_NEEDS),
  details: z.string().trim().min(1).max(LIMITS.details),
  source: z.enum(LEAD_SOURCES),
  privacyConsent: z.literal(true),
  marketingOptIn: z.boolean().default(false),
  /** Honeypot: hidden from people, bots fill it. Must be empty. */
  website: z.string().max(200).default(''),
  /** Signed render timestamp from GET /api/lead (time-trap). */
  token: z.string().min(10).max(200),
  /** Version of the collection notice the visitor saw. */
  noticeVersion: z.string().min(1).max(64),
  /** Optional need-specific extras (see BRIEF_GROUPS). */
  brief: Brief.optional(),
}).superRefine((v, ctx) => {
  if (!v.brief) return;
  const group = briefGroupFor(v.need);
  const allowed: readonly string[] = group ? BRIEF_GROUPS[group].fields : [];
  for (const [key, value] of Object.entries(v.brief)) {
    if (value !== undefined && !allowed.includes(key)) {
      ctx.addIssue({ code: 'custom', path: ['brief', key], message: `brief.${key} does not belong to need "${v.need}"` });
    }
  }
});
export type LeadInput = z.infer<typeof LeadInput>;

/** Field names that failed validation (never the values). */
export function invalidFields(error: z.ZodError): string[] {
  return [
    ...new Set(
      error.issues.map((i) => {
        if (i.path[0] === 'brief') {
          if (i.path.length > 1) return `brief.${String(i.path[1])}`;
          return i.code === 'unrecognized_keys' ? 'brief.unknown_keys' : 'brief';
        }
        if (i.path.length) return String(i.path[0]);
        return i.code === 'unrecognized_keys' ? 'unknown_keys' : 'body';
      }),
    ),
  ];
}
