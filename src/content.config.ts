// Content collections. The Zod schemas here mirror keystatic.config.ts field by field:
// Keystatic writes the YAML files, Astro validates them at build time.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { DIRECTIONS, DISCIPLINES, VAT_MODES, VIDEO_PROVIDERS, WORK_TYPES } from './lib/enums';
import type { VideoProvider } from './lib/enums';

/** Keystatic stores empty text fields as "". Treat blank as "not set". */
const optText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const textList = z
  .array(z.string())
  .default([])
  .transform((list) => list.map((s) => s.trim()).filter(Boolean));

export interface VideoRef {
  provider: VideoProvider;
  /** bunny: "libraryId/videoId" · vimeo/youtube: video id · file: path under /public or https URL */
  id: string;
  /** Path/URL of a WebVTT file (Hebrew captions). */
  captions?: string | undefined;
}

/** Keystatic `fields.conditional` shape: { discriminant, value }. Normalised to VideoRef | undefined. */
const video = z
  .object({
    discriminant: z.enum(['none', ...VIDEO_PROVIDERS]),
    value: z
      .object({ id: z.string().default(''), captions: optText })
      .nullish(),
  })
  .nullish()
  .transform((v): VideoRef | undefined => {
    if (!v || v.discriminant === 'none' || !v.value || !v.value.id.trim()) return undefined;
    return { provider: v.discriminant, id: v.value.id.trim(), captions: v.value.captions };
  });

const works = defineCollection({
  loader: glob({ base: './src/content/works', pattern: '*.yaml' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      artist: optText,
      client: optText,
      type: z.enum(WORK_TYPES),
      disciplines: z.array(z.enum(DISCIPLINES)).min(1),
      year: z.number().int().min(2000).max(2100),
      /** The goal: what had to happen. */
      summary: z.string().min(1),
      deliverables: textList,
      /** Roles, e.g. "רעיון והפקה", "עריכה". */
      credits: textList,
      /** Tools, e.g. "Premiere", "After Effects". */
      tools: textList,
      aiUsed: z.boolean().default(false),
      aiNote: optText,
      /** Rendered ONLY when `source` is filled in. */
      outcome: z
        .object({ text: optText, source: optText })
        .nullish()
        .transform((o) => (o && o.text && o.source ? { text: o.text, source: o.source } : undefined)),
      poster: image(),
      posterAlt: z.string().min(1, 'חובה למלא טקסט חלופי לתמונת הפתיחה'),
      video,
      gallery: z
        .array(
          z.object({
            image: image(),
            alt: z.string().min(1, 'חובה למלא טקסט חלופי לכל תמונה בגלריה'),
          }),
        )
        .default([]),
      websiteUrl: optText,
      /** Required to be true for type=client, otherwise the work is excluded from the build. */
      permissionToShow: z.boolean().default(false),
      /** For clips: was the music licensed / cleared? Missing or false on a client/personal clip triggers a build warning. */
      musicLicensed: z.boolean().optional(),
      featured: z.boolean().default(false),
      order: z.number().int().default(100),
      /** Temporary content. Shown with a "חומר זמני" badge, excluded from production builds. */
      placeholder: z.boolean().default(false),
    }),
});

const services = defineCollection({
  loader: glob({ base: './src/content/services', pattern: '*.yaml' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      summary: z.string().min(1),
      cover: image(),
      coverAlt: z.string().min(1),
      whoFor: textList,
      whatYouGet: textList,
      process: z.array(z.object({ title: z.string().min(1), text: z.string().default('') })).default([]),
      afterDelivery: textList,
      /** Disciplines whose works appear as "relevant works". */
      relatedDisciplines: z.array(z.enum(DISCIPLINES)).default([]),
      /** No prices on the site for now. If ever filled, VAT wording is mandatory. */
      price: z
        .object({ text: optText, vat: z.union([z.enum(VAT_MODES), z.literal('')]).nullish() })
        .nullish()
        .transform((p) => (p && p.text && p.vat ? { text: p.text, vat: p.vat } : undefined)),
      order: z.number().int().default(100),
      placeholder: z.boolean().default(false),
    }),
});

const products = defineCollection({
  loader: glob({ base: './src/content/products', pattern: '*.yaml' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      status: z.enum(['pilot', 'live']).default('pilot'),
      summary: z.string().min(1),
      features: textList,
      /** Plain factual commitments, e.g. "הפיילוט פועל ללא זיהוי פנים". */
      facts: textList,
      /** Lines awaiting legal review. Rendered with a [טיוטה לבדיקה משפטית] marker. */
      legalDraft: textList,
      poster: image(),
      posterAlt: z.string().min(1),
      demoVideo: video,
      appUrl: optText,
      placeholder: z.boolean().default(false),
    }),
});

const settings = defineCollection({
  loader: glob({ base: './src/content/settings', pattern: '*.yaml' }),
  schema: ({ image }) =>
    z.object({
      studioName: z.string().default('AMDIR'),
      ownerName: z.string().default('נריה אנג׳ל'),
      headline: z.string(),
      subline: z.string(),
      defaultDirection: z.enum(DIRECTIONS).default('stage'),
      /** Empty = not set yet. The UI then shows a [להשלמה] slot instead of a link. */
      email: optText,
      /** International format without "+" or spaces, e.g. 9725XXXXXXXX. Empty = not set yet. */
      whatsappNumber: optText,
      /** Shown after a successful form submission, e.g. "תוך יומיים בימי עבודה". */
      replyTime: optText,
      showreel: video,
      showreelPoster: image(),
      showreelPosterAlt: z.string().min(1),
      showreelPlaceholder: z.boolean().default(true),
      business: z
        .object({
          legalName: optText,
          osekNumber: optText,
          address: optText,
        })
        .default({ legalName: undefined, osekNumber: undefined, address: undefined }),
      accessibility: z
        .object({
          contactName: optText,
          contactEmail: optText,
          contactPhone: optText,
          lastReviewed: optText,
        })
        .default({ contactName: undefined, contactEmail: undefined, contactPhone: undefined, lastReviewed: undefined }),
    }),
});

export const collections = { works, services, products, settings };
