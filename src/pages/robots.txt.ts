import type { APIRoute } from 'astro';
import { REVIEW_MODE } from '../lib/config';
import { absolute } from '../lib/url';

export const GET: APIRoute = ({ site }) => {
  const body = REVIEW_MODE
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${absolute('/sitemap.xml', site)}\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
