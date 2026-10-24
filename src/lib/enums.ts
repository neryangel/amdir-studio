// Single source for enum values + Hebrew labels.
// Used by the Zod schemas (src/content.config.ts), Keystatic (keystatic.config.ts) and the UI.

export const WORK_TYPES = ['client', 'personal', 'demo', 'concept'] as const;
export type WorkType = (typeof WORK_TYPES)[number];
export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  client: 'לקוח',
  personal: 'אישי',
  demo: 'דמו',
  concept: 'קונספט',
};

export const DISCIPLINES = ['clips', 'video', 'motion', 'ai', 'web', 'photo'] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  clips: 'קליפים',
  video: 'וידאו',
  motion: 'מושן',
  ai: 'AI',
  web: 'אתרים',
  photo: 'תמונות',
};

/** Filters shown on /work. "video" groups video + motion. */
export const WORK_FILTERS = [
  { key: 'all', label: 'הכול', match: [] as Discipline[] },
  { key: 'clips', label: 'קליפים', match: ['clips'] as Discipline[] },
  { key: 'video', label: 'וידאו ומושן', match: ['video', 'motion'] as Discipline[] },
  { key: 'ai', label: 'AI', match: ['ai'] as Discipline[] },
  { key: 'web', label: 'אתרים', match: ['web'] as Discipline[] },
  { key: 'photo', label: 'תמונות', match: ['photo'] as Discipline[] },
] as const;
export type FilterKey = (typeof WORK_FILTERS)[number]['key'];

export const VIDEO_PROVIDERS = ['bunny', 'vimeo', 'youtube', 'file'] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export const DIRECTIONS = ['stage', 'index'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const DIRECTION_LABEL: Record<Direction, string> = {
  stage: 'א׳ במה',
  index: 'ב׳ אינדקס',
};

/** Units for typical-timeline ranges on service pages. */
export const DURATION_UNITS = ['days', 'weeks'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];
export const DURATION_UNIT_LABEL: Record<DurationUnit, string> = {
  days: 'ימי עבודה',
  weeks: 'שבועות',
};
/** Delivery aspect ratios for format variants (16:9 master + social cuts). */

export const ASPECTS = ['16:9', '9:16', '1:1', '4:5'] as const;
export type Aspect = (typeof ASPECTS)[number];
export const ASPECT_LABEL: Record<Aspect, string> = {
  '16:9': 'מאסטר לרוחב',
  '9:16': 'אנכי לסטוריז ורילס',
  '1:1': 'ריבוע לפיד',
  '4:5': 'אנכי לפיד',
};
/** CSS-safe key (no inline styles under the CSP): '16:9' -> '16x9'. */
export const aspectKey = (a: Aspect): string => a.replace(':', 'x');

export const VAT_MODES = ['plus', 'incl'] as const;
export type VatMode = (typeof VAT_MODES)[number];
export const VAT_LABEL: Record<VatMode, string> = {
  plus: '+מע״מ',
  incl: 'כולל מע״מ',
};
