import type { APIRoute, GetStaticPaths } from 'astro';
import { getSettings } from '../../lib/content';
import { getOgPages, type OgPage } from '../../lib/og-pages';
import { renderOgCard } from '../../lib/og-render';

// One branded 1200x630 PNG per page, generated at build time (see src/lib/og-render.ts).
export const getStaticPaths = (async () => {
  const pages = await getOgPages();
  return pages.map((page) => ({ params: { key: page.key }, props: { page } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ page: OgPage }> = async ({ props }) => {
  const settings = await getSettings();
  const png = await renderOgCard({
    title: props.page.title,
    kicker: props.page.kicker,
    brand: settings.studioName,
    direction: settings.defaultDirection,
  });
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
};
