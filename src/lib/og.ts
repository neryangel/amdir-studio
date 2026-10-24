// Per-page OpenGraph image keys. Pure, so Base.astro, the /og/[key].png endpoint and tests agree.

/** "/" -> "home", "/services/clips/" -> "services-clips". */
export function ogKey(path: string): string {
  const clean = path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  return clean || 'home';
}

/** Public path of the generated image for a page path (base-less, pass through url()/absolute()). */
export function ogPath(path: string): string {
  return `/og/${ogKey(path)}.png`;
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
