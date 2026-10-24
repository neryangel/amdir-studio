// QA: serve a build folder, then with Playwright (system Chromium):
//  - screenshot every page at 390 and 1440 in both directions (+ index dark)
//  - assert no horizontal overflow
//  - run axe (WCAG 2.0/2.1 A+AA) on every page in every theme
//  - functional checks: no third-party requests, video facade, work filters (with and without JS), contact form
// Usage: node scripts/qa.mjs [distDir=dist-review] [shotsDir]
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import handler from 'serve-handler';
import { applyVercelHeaders } from './vercel-headers.mjs';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.resolve(root, process.argv[2] ?? 'dist-review');
const shots = path.resolve(process.argv[3] ?? path.join(root, 'qa-shots'));
const base = (process.env.QA_BASE ?? '/').replace(/\/?$/, '/');
// Local sandbox: system Chromium under /opt/pw-browsers. CI: browsers installed by `npx playwright install`.
const chromeDir = existsSync('/opt/pw-browsers') ? readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d)) : undefined;
const executablePath = process.env.CHROME_PATH ?? (chromeDir ? `/opt/pw-browsers/${chromeDir}/chrome-linux/chrome` : undefined);

const server = http.createServer((req, res) => {
  if (base !== '/' && req.url?.startsWith(base)) req.url = req.url.slice(base.length - 1);
  applyVercelHeaders((req.url ?? '/').split('?')[0], res);
  return handler(req, res, { public: dist, trailingSlash: true });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const origin = `http://127.0.0.1:${port}`;
const site = `${origin}${base}`;

// Pages = every <loc> in the sitemap (re-based to the local server) + 404.
const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(base, '/'));
pages.push('/404.html');

const themes = [
  { key: 'stage', query: 'direction=stage', colorScheme: 'dark' },
  { key: 'index-light', query: 'direction=index&theme=light', colorScheme: 'light' },
  { key: 'index-dark', query: 'direction=index&theme=dark', colorScheme: 'dark' },
];
const widths = [390, 1440];

await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
const report = { site, pages: pages.length, overflow: [], axe: [], thirdParty: [], functional: [], consoleErrors: [] };
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/[/.]/g, '-'));

for (const theme of themes) {
  for (const width of widths) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      deviceScaleFactor: 1,
      colorScheme: /** @type {'dark'|'light'} */ (theme.colorScheme),
      locale: 'he-IL',
    });
    const page = await ctx.newPage();
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('data')) {
        report.thirdParty.push({ page: page.url(), url: r.url() });
      }
    });
    page.on('console', (m) => {
      if (m.type() === 'error') report.consoleErrors.push({ page: page.url(), text: m.text() });
    });
    for (const p of pages) {
      const target = `${origin}${base}${p.replace(/^\//, '')}?${theme.query}`;
      await page.goto(target, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      // load lazy images, keep the review bar out of full-page shots
      await page.evaluate(async () => {
        document.querySelectorAll('img[loading="lazy"]').forEach((i) => i.setAttribute('loading', 'eager'));
        const pending = [...document.images].filter((i) => !i.complete);
        await Promise.race([
          Promise.all(pending.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))),
          new Promise((r) => setTimeout(r, 3000)),
        ]);
      });
      // CSP forbids injected <style>; CSSOM changes are allowed.
      await page.evaluate(() => {
        const bar = document.querySelector('.review-bar');
        if (bar instanceof HTMLElement) bar.style.setProperty('position', 'static', 'important');
        document.body.style.setProperty('padding-bottom', '0', 'important');
      });
      const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      if (dims.sw > dims.cw + 1) report.overflow.push({ page: p, theme: theme.key, width, ...dims });
      // screenshots: both directions at both widths; index-dark at 1440 only
      if (theme.key !== 'index-dark' || width === 1440) {
        await page.screenshot({ path: path.join(shots, `${slug(p)}--${theme.key}--${width}.png`), fullPage: true });
      }
      if (width === 1440 || theme.key === 'stage') {
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        for (const v of axe.violations) {
          report.axe.push({ page: p, theme: theme.key, width, id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target });
        }
      }
    }
    await ctx.close();
  }
}

// ---------- functional checks ----------
const check = (name, ok, detail = '') => report.functional.push({ name, ok, detail });
if (!process.env.QA_SKIP_FUNCTIONAL) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const external = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(origin)) external.push(r.url());
  });

  // Video facade: nothing heavy before click, <video> with captions after click.
  await page.goto(`${site}?direction=stage`, { waitUntil: 'networkidle' });
  const before = await page.evaluate(() => document.querySelectorAll('.facade video, .facade iframe').length);
  const mp4Before = await page.evaluate(() => performance.getEntriesByType('resource').some((e) => e.name.endsWith('.mp4')));
  // Playwright's Chromium has no H.264, and an undecodable file now (correctly) falls back to the poster.
  // So the happy path gets a WebM preview from the build in place of the hero MP4; the fallback is checked below.
  const worksDir = path.join(dist, 'media', 'works');
  const webmDir = existsSync(worksDir) ? readdirSync(worksDir).find((d) => existsSync(path.join(worksDir, d, 'preview.webm'))) : undefined;
  if (webmDir) {
    const webm = await readFile(path.join(worksDir, webmDir, 'preview.webm'));
    await page.route(/\/media\/[^/]+\.mp4$/, (r) => r.fulfill({ status: 200, contentType: 'video/webm', body: webm }));
  }
  await page.click('.hero .facade__play');
  await page.waitForSelector('.hero .facade video');
  const after = await page.evaluate(() => {
    const v = document.querySelector('.hero .facade video');
    return { tracks: v?.querySelectorAll('track').length ?? 0, muted: v?.muted, focused: document.activeElement === v };
  });
  check('facade: no player before click', before === 0 && !mp4Before, `players=${before} mp4Loaded=${mp4Before}`);
  check('facade: <video> + Hebrew captions after click, focus moved', after.tracks === 1 && after.focused, JSON.stringify(after));

  // Facade, file that fails (404 / codec): player removed, play button back + focused, polite message with a direct link.
  await page.unrouteAll();
  await page.route(/\/media\/[^/]+\.mp4$/, (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto(`${site}?direction=stage`, { waitUntil: 'networkidle' });
  await page.click('.hero .facade__play');
  await page.waitForSelector('.hero .facade__error a', { timeout: 8000 }).catch(() => {});
  const failed = await page.evaluate(() => {
    const root = document.querySelector('.hero .facade');
    const msg = root?.querySelector('.facade__error');
    const btn = root?.querySelector('.facade__play');
    return {
      players: root?.querySelectorAll('video').length,
      role: msg?.getAttribute('role'),
      href: msg?.querySelector('a')?.getAttribute('href'),
      btnVisible: btn instanceof HTMLElement && btn.offsetParent !== null,
      focused: document.activeElement === btn,
    };
  });
  check('facade: failed file falls back to poster + play button, message with direct link',
    failed.players === 0 && failed.role === 'status' && !!failed.href?.endsWith('.mp4') && failed.btnVisible && failed.focused, JSON.stringify(failed));
  await page.unrouteAll();

  // Work filters (JS on): URL sync + count announcement
  await page.goto(`${site}work/`, { waitUntil: 'networkidle' });
  const total = await page.locator('.index-row').count();
  await page.click('label.chip:has(#f-web)');
  const visibleWeb = await page.locator('.index-row:visible').count();
  const status = await page.textContent('[data-filter-status]');
  check('filters (JS): web filter', visibleWeb > 0 && visibleWeb < total && page.url().includes('d=web'), `total=${total} web=${visibleWeb} status="${status}" url=${page.url()}`);
  await page.goto(`${site}work/?d=ai`, { waitUntil: 'networkidle' });
  const visibleAi = await page.locator('.index-row:visible').count();
  check('filters (JS): ?d=ai deep link', visibleAi > 0 && visibleAi < total, `ai=${visibleAi}`);

  // Contact form: validation + honest "not connected" message, data kept
  await page.goto(`${site}contact/`, { waitUntil: 'networkidle' });
  const marketingDefault = await page.isChecked('#contact-marketing');
  await page.click('form[data-lead-form] button[type=submit]');
  const invalid = await page.locator('form[data-lead-form] [aria-invalid=true]').count();
  const focusedId = await page.evaluate(() => document.activeElement?.id);
  check('form: empty submit marks 5 required fields, focuses first', invalid === 5 && focusedId === 'contact-name', `invalid=${invalid} focus=${focusedId}`);
  await page.fill('#contact-name', 'בדיקה');
  await page.fill('#contact-reach', 'not-valid');
  await page.click('form[data-lead-form] button[type=submit]');
  const reachErr = await page.textContent('#contact-reach-err');
  check('form: invalid phone/email message', !!reachErr && reachErr.length > 5, reachErr ?? '');
  await page.fill('#contact-reach', '050-1234567');
  await page.selectOption('#contact-need', 'web');
  await page.fill('#contact-details', 'אתר לעסק');
  await page.check('#contact-privacy');
  await page.click('form[data-lead-form] button[type=submit]');
  const msg = (await page.textContent('#contact-status')) ?? '';
  const kept = await page.inputValue('#contact-name');
  check('form: not-connected message, no success claim, data kept', msg.includes('הטופס עדיין לא מחובר') && !msg.includes('נשלח') && kept === 'בדיקה', msg);
  check('form: marketing checkbox unticked by default', marketingDefault === false);
  check('no third-party requests during functional run', external.length === 0, external.join(', '));
  await ctx.close();

  // ---- muted preview loops ----
  const mediaReq = (ctxReqs) => ctxReqs.filter((u) => /\/media\/works\/.+\/preview\.(mp4|webm)/.test(u));
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const reqs = [];
    c.on('request', (r) => reqs.push(r.url()));
    const p = await c.newPage();
    await p.goto(`${site}?direction=stage`, { waitUntil: 'networkidle' });
    const lcpTag = await p.evaluate(() => new Promise((res) => {
      new PerformanceObserver((l) => { const e = l.getEntries().at(-1); res(e?.element?.tagName ?? 'none'); }).observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => res('timeout'), 3000);
    }));
    const before = mediaReq(reqs).length;
    const card = p.locator('.work-card:has(video.work-card__preview)').first();
    await card.hover();
    await p.waitForSelector('video.work-card__preview[data-playing]', { timeout: 8000 }).catch(() => {});
    const playing = await p.locator('video.work-card__preview[data-playing]').count();
    check('previews (desktop): nothing loaded before hover, plays muted on hover, LCP is an image',
      before === 0 && playing === 1 && mediaReq(reqs).length > 0 && lcpTag === 'IMG', `before=${before} playing=${playing} lcp=${lcpTag}`);
    await p.mouse.move(5, 5);
    await p.waitForTimeout(300);
    check('previews (desktop): stops on leave', (await p.locator('video.work-card__preview[data-playing]').count()) === 0);
    await c.close();
  }
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const reqs = [];
    c.on('request', (r) => reqs.push(r.url()));
    const p = await c.newPage();
    await p.goto(`${site}?direction=stage`, { waitUntil: 'networkidle' });
    await p.locator('.work-card:has(video.work-card__preview)').first().hover();
    await p.waitForTimeout(1200);
    check('previews: never play under prefers-reduced-motion', mediaReq(reqs).length === 0 && (await p.locator('video[data-playing]').count()) === 0);
    await c.close();
  }
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await c.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }));
    const reqs = [];
    c.on('request', (r) => reqs.push(r.url()));
    const p = await c.newPage();
    await p.goto(`${site}?direction=stage`, { waitUntil: 'networkidle' });
    await p.locator('.work-card:has(video.work-card__preview)').first().hover();
    await p.waitForTimeout(1200);
    check('previews: never play with Save-Data', mediaReq(reqs).length === 0);
    await c.close();
  }
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const reqs = [];
    c.on('request', (r) => reqs.push(r.url()));
    const p = await c.newPage();
    await p.goto(`${site}?direction=stage`, { waitUntil: 'networkidle' });
    const before = mediaReq(reqs).length;
    await p.locator('video.work-card__preview').first().scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollBy(0, 0));
    await p.waitForSelector('video.work-card__preview[data-playing]', { timeout: 8000 }).catch(() => {});
    const playing = await p.locator('video.work-card__preview[data-playing]').count();
    // WCAG 2.2.2: no pause control on touch, so it plays once (no loop) for at most 5s, then back to the poster.
    const loops = await p.locator('video.work-card__preview').first().evaluate((v) => v.loop);
    await p.waitForTimeout(5500);
    const stillPlaying = await p.locator('video.work-card__preview[data-playing]').count();
    check('previews (mobile): nothing before view, one plays when >=60% in view, stops on the poster within 5s',
      before === 0 && playing === 1 && !loops && stillPlaying === 0, `before=${before} playing=${playing} loop=${loops} after5s=${stillPlaying}`);
    await c.close();
  }

  // Filters without JS (pure CSS)
  const noJs = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const p2 = await noJs.newPage();
  await p2.goto(`${site}work/`, { waitUntil: 'networkidle' });
  const all = await p2.locator('.index-row:visible').count();
  await p2.click('label.chip:has(#f-clips)');
  const clips = await p2.locator('.index-row:visible').count();
  check('filters (no JS): CSS :has() filtering', clips > 0 && clips < all, `all=${all} clips=${clips}`);
  await noJs.close();
}

await browser.close();
server.close();

const axeSummary = report.axe.reduce((acc, v) => {
  acc[v.impact ?? 'unknown'] = (acc[v.impact ?? 'unknown'] ?? 0) + 1;
  return acc;
}, {});
const summary = {
  site,
  pages: pages.length,
  screenshots: readdirSync(shots).filter((f) => f.endsWith('.png')).length,
  overflowCount: report.overflow.length,
  axeByImpact: axeSummary,
  axeRules: [...new Set(report.axe.map((v) => `${v.id}(${v.impact})`))],
  thirdPartyRequests: report.thirdParty.length,
  consoleErrors: report.consoleErrors.length,
  functional: report.functional.map((f) => `${f.ok ? 'PASS' : 'FAIL'} ${f.name}${f.ok ? '' : ` :: ${f.detail}`}`),
};
await writeFile(path.join(root, process.env.QA_REPORT ?? 'qa-report.json'), JSON.stringify({ summary, ...report }, null, 2));
console.log(JSON.stringify(summary, null, 2));
const failed = report.functional.filter((f) => !f.ok).length;
const seriousAxe = report.axe.filter((v) => v.impact === 'serious' || v.impact === 'critical').length;
if (failed || seriousAxe || report.overflow.length || report.consoleErrors.length || report.thirdParty.length) process.exitCode = 1;
if (report.overflow.length) console.log('OVERFLOW:', JSON.stringify(report.overflow, null, 1));
if (report.axe.length) console.log('AXE:', JSON.stringify(report.axe.slice(0, 30), null, 1));
if (report.consoleErrors.length) console.log('CONSOLE:', JSON.stringify(report.consoleErrors.slice(0, 10), null, 1));
if (report.thirdParty.length) console.log('3RD PARTY:', JSON.stringify(report.thirdParty.slice(0, 10), null, 1));
