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
  trailingSlash: 'always',
  build: { format: 'directory' },
  ...(adapter ? { adapter } : {}),
  integrations: devIntegrations,
  image: {
    // Responsive images: Astro generates srcset + width/height.
    layout: 'constrained',
    responsiveStyles: true,
  },
  prefetch: false,
  devToolbar: { enabled: false },
});
