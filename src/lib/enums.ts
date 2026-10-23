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

export const VAT_MODES = ['plus', 'incl'] as const;
export type VatMode = (typeof VAT_MODES)[number];
export const VAT_LABEL: Record<VatMode, string> = {
  plus: '+מע״מ',
  incl: 'כולל מע״מ',
};
