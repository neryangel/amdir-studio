// All content queries go through here, so the visibility rules live in ONE place:
//  1. placeholder items are excluded unless SHOW_PLACEHOLDERS
//  2. client works without permissionToShow are ALWAYS excluded (with a build warning)
//  3. client/personal clips without musicLicensed=true produce a build warning (not excluded)
//  4. needsReview items (from scripts/ingest.mjs) are treated like placeholders
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { SHOW_PLACEHOLDERS } from './config';
import { WORK_FILTERS, type FilterKey } from './enums';
import { formatWorkTitle } from './titles';

export type Work = CollectionEntry<'works'>;
export type Service = CollectionEntry<'services'>;
export type Product = CollectionEntry<'products'>;

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`\x1b[33m[amdir content]\x1b[0m ${message}`);
}

export function isWorkVisible(work: Work): boolean {
  const d = work.data;
  if (d.type === 'client' && !d.permissionToShow) {
    warnOnce(`perm:${work.id}`, `עבודת לקוח "${work.id}" לא נכללה: חסר אישור להציג (permissionToShow).`);
    return false;
  }
  if (d.disciplines.includes('clips') && (d.type === 'client' || d.type === 'personal') && d.musicLicensed !== true) {
    warnOnce(`music:${work.id}`, `קליפ "${work.id}": לא סומן שהמוזיקה מורשית (musicLicensed). העבודה נכללת, אבל כדאי לבדוק.`);
  }
  if ((d.placeholder || d.needsReview) && !SHOW_PLACEHOLDERS) return false;
  return true;
}

export async function getWorks(): Promise<Work[]> {
  const all = await getCollection('works');
  return all.filter(isWorkVisible).sort((a, b) => a.data.order - b.data.order || b.data.year - a.data.year);
}

export async function getFeaturedWorks(limit = 6): Promise<Work[]> {
  const works = await getWorks();
  const featured = works.filter((w) => w.data.featured);
  return (featured.length ? featured : works).slice(0, limit);
}

export async function getServices(): Promise<Service[]> {
  const all = await getCollection('services');
  return all.filter((s) => SHOW_PLACEHOLDERS || !s.data.placeholder).sort((a, b) => a.data.order - b.data.order);
}

export async function getProducts(): Promise<Product[]> {
  const all = await getCollection('products');
  return all.filter((p) => SHOW_PLACEHOLDERS || !p.data.placeholder);
}

export async function getSettings() {
  const entry = await getEntry('settings', 'site');
  if (!entry) throw new Error('Missing src/content/settings/site.yaml');
  return entry.data;
}

/** "אמן - שיר" for clips, "פרויקט ל־לקוח" for client work, otherwise the title. */
export function workTitle(work: Work): string {
  return formatWorkTitle(work.data);
}

/** Filter keys a work belongs to (used by the CSS-only filter + its JS enhancement). */
export function filterKeys(work: Work): FilterKey[] {
  return WORK_FILTERS.filter((f) => f.key !== 'all' && f.match.some((d) => work.data.disciplines.includes(d))).map(
    (f) => f.key,
  );
}

/** Related works: shares a discipline, excluding itself. */
export function relatedWorks(work: Work, all: Work[], limit = 3): Work[] {
  return all
    .filter((w) => w.id !== work.id && w.data.disciplines.some((d) => work.data.disciplines.includes(d)))
    .slice(0, limit);
}

/** Map of which nav destinations exist in this build (placeholder services/products may be excluded). */
export async function getRoutes() {
  const [services, products] = await Promise.all([getServices(), getProducts()]);
  return {
    services: services.map((s) => ({ id: s.id, title: s.data.title, href: `/services/${s.id}/` })),
    products: products.map((p) => ({ id: p.id, title: p.data.title, href: `/products/${p.id}/` })),
  };
}
