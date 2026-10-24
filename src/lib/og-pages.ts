// Which pages get a generated OG card, and what it says. Base.astro and /og/[key].png read the
// same list, so a page only points at an image that the build actually produced.
// Work pages use their own poster as og:image and are not listed here.
import { getProducts, getServices, getSettings } from './content';
import { ogKey } from './og';

export interface OgPage {
  key: string;
  path: string;
  title: string;
  kicker: string;
}

export async function getOgPages(): Promise<OgPage[]> {
  const [settings, services, products] = await Promise.all([getSettings(), getServices(), getProducts()]);
  const dot = settings.headline.indexOf('.');
  const homeTitle = dot > 0 ? settings.headline.slice(0, dot + 1) : settings.headline;
  const studio = settings.subline;
  const pages: Omit<OgPage, 'key'>[] = [
    { path: '/', title: homeTitle, kicker: studio },
    { path: '/work/', title: 'עבודות', kicker: studio },
    { path: '/process/', title: 'איך אני עובד', kicker: 'מהפנייה הראשונה ועד המסירה' },
    { path: '/faq/', title: 'שאלות נפוצות', kicker: studio },
    { path: '/about/', title: 'סטודיו', kicker: studio },
    { path: '/contact/', title: 'ספרו לי על הפרויקט', kicker: 'יצירת קשר' },
    { path: '/products/', title: 'מוצרים', kicker: studio },
    { path: '/privacy/', title: 'מדיניות פרטיות', kicker: studio },
    { path: '/accessibility/', title: 'הצהרת נגישות', kicker: studio },
    { path: '/terms/', title: 'תנאי שימוש ושירות', kicker: studio },
    ...services.map((s) => ({ path: `/services/${s.id}/`, title: s.data.title, kicker: 'שירות' })),
    ...products.map((p) => ({ path: `/products/${p.id}/`, title: p.data.title, kicker: 'מוצר של AMDIR' })),
  ];
  return pages.map((p) => ({ ...p, key: ogKey(p.path) }));
}

/** Path of the generated card for a page, or undefined if the page has none. */
export async function ogImageFor(path: string): Promise<string | undefined> {
  const page = (await getOgPages()).find((p) => p.path === path);
  return page ? `/og/${page.key}.png` : undefined;
}
