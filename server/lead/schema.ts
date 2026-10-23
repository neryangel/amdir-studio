import * as z from 'zod';
import { LEAD_NEEDS, LEAD_SOURCES, LIMITS, contactKind } from '../../src/lib/lead-shared';

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
});
export type LeadInput = z.infer<typeof LeadInput>;

/** Field names that failed validation (never the values). */
export function invalidFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((i) => (i.path.length ? String(i.path[0]) : i.code === 'unrecognized_keys' ? 'unknown_keys' : 'body')))];
}
