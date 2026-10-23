// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

/*
 * AMDIR studio site.
 *
 * Output is fully static (dist/). Keystatic (the content editor at /keystatic)
 * needs on-demand routes, so it is loaded ONLY when running `astro dev`.
 * In dev we add React + Keystatic + the Node adapter; `astro build` never
 * sees them, so the production output stays plain HTML/CSS with tiny scripts.
 */
const isDev = process.argv.includes('dev');
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');

const site = env.PUBLIC_SITE_URL || 'https://studio.amdir.example';
// Base path for hosting under a sub-folder (e.g. "/review/"). Default "/".
const base = env.PUBLIC_BASE_PATH || '/';

// Lead endpoint: same-origin by default ("/api/lead"). If absolute, allow its origin in connect-src.
const leadEndpoint = env.PUBLIC_LEAD_ENDPOINT || '';
const leadOrigin = /^https?:\/\//.test(leadEndpoint) ? new URL(leadEndpoint).origin : '';

// Content-Security-Policy (production builds only; Keystatic in dev needs a looser policy).
// Astro emits it as a <meta> tag with sha256 hashes for every script/style it renders.
// frame-ancestors cannot live in <meta>, so it is sent as a header from vercel.json.
const VIDEO_FRAMES = ['https://iframe.mediadelivery.net', 'https://player.vimeo.com', 'https://www.youtube-nocookie.com'];
/** @type {NonNullable<Exclude<NonNullable<import('astro').AstroUserConfig['security']>['csp'], boolean>>} */
const csp = {
  directives: [
    "default-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "media-src 'self'",
    `frame-src ${VIDEO_FRAMES.join(' ')}`,
    `connect-src 'self'${leadOrigin ? ` ${leadOrigin}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ],
};

/** @type {import('astro').AstroIntegration[]} */
const devIntegrations = [];
/** @type {import('astro').AstroUserConfig['adapter']} */
let adapter;

if (isDev) {
  const [{ default: react }, { default: keystatic }, { default: node }] = await Promise.all([
    import('@astrojs/react'),
    import('@keystatic/astro'),
    import('@astrojs/node'),
  ]);
  devIntegrations.push(react(), keystatic());
  adapter = node({ mode: 'standalone' });
}

export default defineConfig({
  site,
  base,
  output: 'static',
  // Keystatic's API routes have no trailing slash, so dev must not enforce one.
  trailingSlash: isDev ? 'ignore' : 'always',
  build: { format: 'directory' },
  ...(adapter ? { adapter } : {}),
  integrations: devIntegrations,
  image: {
    // Responsive images: Astro generates srcset + width/height.
    layout: 'constrained',
    responsiveStyles: true,
  },
  // In dev, /api/lead is proxied to `npm run dev:api` (scripts/local-server.ts, JSONL store).
  // Builds: never inline assets as data: URIs (keeps CSP font-src/img-src strict).
  vite: isDev ? { server: { proxy: { '/api/lead': 'http://127.0.0.1:8787' } } } : { build: { assetsInlineLimit: 0 } },
  prefetch: false,
  ...(isDev ? {} : { security: { csp } }),
  devToolbar: { enabled: false },
});
