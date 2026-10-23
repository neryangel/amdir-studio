// QA: serve a build folder, then with Playwright (system Chromium):
//  - screenshot every page at 390 and 1440 in both directions (+ index dark)
//  - assert no horizontal overflow
//  - run axe (WCAG 2.0/2.1 A+AA) on every page in every theme
//  - functional checks: no third-party requests, video facade, work filters (with and without JS), contact form
// Usage: node scripts/qa.mjs [distDir=dist-review] [shotsDir]
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import handler from 'serve-handler';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.resolve(root, process.argv[2] ?? 'dist-review');
const shots = path.resolve(process.argv[3] ?? path.join(root, 'qa-shots'));
const base = (process.env.QA_BASE ?? '/').replace(/\/?$/, '/');
const chromeDir = readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d));
const executablePath = process.env.CHROME_PATH ?? `/opt/pw-browsers/${chromeDir}/chrome-linux/chrome`;

const server = http.createServer((req, res) => {
  if (base !== '/' && req.url?.startsWith(base)) req.url = req.url.slice(base.length - 1);
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
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
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
      await page.addStyleTag({ content: '.review-bar{position:static!important}body.has-review-bar{padding-bottom:0!important}' });
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
  await page.click('.hero .facade__play');
  await page.waitForSelector('.hero .facade video');
  const after = await page.evaluate(() => {
    const v = document.querySelector('.hero .facade video');
    return { tracks: v?.querySelectorAll('track').length ?? 0, muted: v?.muted, focused: document.activeElement === v };
  });
  check('facade: no player before click', before === 0 && !mp4Before, `players=${before} mp4Loaded=${mp4Before}`);
  check('facade: <video> + Hebrew captions after click, focus moved', after.tracks === 1 && after.focused, JSON.stringify(after));

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
if (report.overflow.length) console.log('OVERFLOW:', JSON.stringify(report.overflow, null, 1));
if (report.axe.length) console.log('AXE:', JSON.stringify(report.axe.slice(0, 30), null, 1));
if (report.consoleErrors.length) console.log('CONSOLE:', JSON.stringify(report.consoleErrors.slice(0, 10), null, 1));
if (report.thirdParty.length) console.log('3RD PARTY:', JSON.stringify(report.thirdParty.slice(0, 10), null, 1));
