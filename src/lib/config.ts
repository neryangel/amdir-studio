// Build-time flags. All are read from PUBLIC_* env vars (see .env.example).
const env = import.meta.env;

/** Placeholder items are always visible in `astro dev`; in builds only with PUBLIC_SHOW_PLACEHOLDERS=true. */
export const SHOW_PLACEHOLDERS: boolean = env.DEV || env.PUBLIC_SHOW_PLACEHOLDERS === 'true';

/** Review switcher (compare design directions). Never enable on the public site. */
export const REVIEW_MODE: boolean = env.PUBLIC_REVIEW_MODE === 'true';

/** Marker used everywhere content still has to be supplied by the owner. */
export const TODO = '[להשלמה]';
