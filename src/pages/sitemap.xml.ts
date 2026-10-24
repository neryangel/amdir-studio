import type { APIRoute } from 'astro';
import { getProducts, getServices, getWorks } from '../lib/content';
import { absolute } from '../lib/url';

// Hand-rolled sitemap: lists exactly the pages that exist in this build
// (placeholder or unpermitted items are excluded by the same rules as the pages).
export const GET: APIRoute = async ({ site }) => {
  const [works, services, products] = await Promise.all([getWorks(), getServices(), getProducts()]);
  const paths = [
    '/',
    '/work/',
    ...works.map((w) => `/work/${w.id}/`),
    ...services.map((s) => `/services/${s.id}/`),
    '/process/',
    '/faq/',
    '/products/',
    ...products.map((p) => `/products/${p.id}/`),
    '/about/',
    '/contact/',
    '/privacy/',
    '/accessibility/',
    '/terms/',
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${absolute(p, site)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
