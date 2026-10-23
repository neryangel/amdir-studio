// Base-path aware internal links. Always use url('/work/') instead of a bare "/work/",
// so the site works when hosted under a sub-folder (PUBLIC_BASE_PATH).
const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

export function url(path = '/'): string {
  if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
  const clean = path.replace(/^\/+/, '');
  return `${BASE}${clean}`;
}

/** Public asset path (files in /public), base-aware. Absolute URLs pass through. */
export function asset(path: string): string {
  return url(path);
}

/** Absolute URL for canonical / OpenGraph / JSON-LD. */
export function absolute(path: string, site: URL | undefined): string {
  const origin = site ?? new URL('https://studio.amdir.example');
  return new URL(url(path), origin).toString();
}

export function whatsappHref(number: string | undefined): string | undefined {
  if (!number) return undefined;
  const digits = number.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : undefined;
}
