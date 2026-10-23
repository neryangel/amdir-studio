// Screen-reader-oriented checks on the accessibility tree (Playwright aria snapshots).
// Not a substitute for a real NVDA / VoiceOver / TalkBack pass.
//   node scripts/a11y-tree.mjs [dist-review] [outDir]
import http from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import handler from 'serve-handler';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.resolve(root, process.argv[2] ?? 'dist-review');
const out = path.resolve(process.argv[3] ?? path.join(root, 'qa-shots', 'aria'));
await mkdir(out, { recursive: true });

const server = http.createServer((req, res) => handler(req, res, { public: dist, trailingSlash: true }));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${server.address().port}`;
const chromeDir = existsSync('/opt/pw-browsers') ? readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d)) : undefined;
const executablePath = process.env.CHROME_PATH ?? (chromeDir ? `/opt/pw-browsers/${chromeDir}/chrome-linux/chrome` : undefined);
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const HEBREW = /[֐-׿]/;

/** Headings in DOM order as exposed to AT (skips hidden ones). */
async function headings(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')]
      .filter((h) => {
        const st = getComputedStyle(h);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        return !h.closest('[aria-hidden="true"],[hidden]');
      })
      .map((h) => ({ level: Number(h.getAttribute('aria-level') ?? h.tagName.slice(1)), text: (h.textContent ?? '').replace(/\s+/g, ' ').trim() })),
  );
}

function headingProblems(list) {
  const problems = [];
  if (list.filter((h) => h.level === 1).length !== 1) problems.push(`h1 count ${list.filter((h) => h.level === 1).length}`);
  if (list[0]?.level !== 1) problems.push(`first heading is h${list[0]?.level}`);
  for (let i = 1; i < list.length; i++) {
    if (list[i].level > list[i - 1].level + 1) problems.push(`jump h${list[i - 1].level}→h${list[i].level} at "${list[i].text}"`);
  }
  return problems;
}

/** Landmarks from the aria snapshot: role + accessible name. */
function landmarks(snapshot) {
  const found = [];
  for (const line of snapshot.split('\n')) {
    const m = line.match(/^\s*- (banner|main|contentinfo|navigation|region|complementary|search|form)(?: "([^"]*)")?/);
    if (m) found.push({ role: m[1], name: m[2] ?? '' });
  }
  return found;
}

const pages = [
  ['home', '/'],
  ['work-index', '/work/'],
  ['work-page', '/work/clip-original-song/'],
  ['contact', '/contact/'],
];

for (const dir of ['stage', 'index']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  for (const [name, p] of pages) {
    await page.goto(`${site}${p}?direction=${dir}`, { waitUntil: 'networkidle' });
    const snap = await page.locator('body').ariaSnapshot();
    await writeFile(path.join(out, `${name}--${dir}.aria.yml`), snap);

    const hs = await headings(page);
    const hp = headingProblems(hs);
    check(`[${dir}] ${name}: heading order`, hp.length === 0, hp.join('; ') || hs.map((h) => `h${h.level} ${h.text}`).join(' / '));

    // Accessible names: no stray space before punctuation (e.g. "קול : x"), which screen readers read out.
    const badNames = [...snap.matchAll(/(?:link|button|heading|textbox|checkbox|radio|combobox|img) "([^"]*)"/g)]
      .map((m) => m[1])
      .filter((n) => / [,:.;]/.test(n));
    check(`[${dir}] ${name}: accessible names have clean punctuation`, badNames.length === 0, badNames.join(' | '));
    if (name === 'home') {
      const card = page.locator('article.work-card').first();
      const link = card.locator('a.work-card__link');
      const title = ((await link.textContent()) ?? '').trim();
      const meta = ((await card.locator('.work-card__meta').textContent()) ?? '').replace(/\s+/g, ' ').trim();
      try {
        await expect(link).toHaveAccessibleName(title);
        check(`[${dir}] work card: link name is the title, metadata follows as text`, /סוג העבודה:/.test(meta) && /תחום:/.test(meta), meta);
      } catch (e) {
        check(`[${dir}] work card: link name is the title, metadata follows as text`, false, e instanceof Error ? e.message.split('\n')[0] : '');
      }
    }

    const lm = landmarks(snap);
    const count = (role) => lm.filter((l) => l.role === role).length;
    const unnamedNav = lm.filter((l) => l.role === 'navigation' && !l.name);
    const nonHebrew = lm.filter((l) => l.name && !HEBREW.test(l.name));
    check(
      `[${dir}] ${name}: landmarks (1 banner, 1 main, 1 contentinfo, named Hebrew navigation/regions)`,
      count('banner') === 1 && count('main') === 1 && count('contentinfo') === 1 && unnamedNav.length === 0 && nonHebrew.length === 0,
      lm.map((l) => `${l.role}${l.name ? `"${l.name}"` : ''}`).join(', '),
    );
  }

  // Filter state exposed: radio [checked] + polite status text
  await page.goto(`${site}/work/?direction=${dir}`, { waitUntil: 'networkidle' });
  const group = page.getByRole('group', { name: 'סינון לפי תחום' });
  await expect(group.getByRole('radio', { name: /^הכול/ })).toBeChecked();
  const webRadio = group.getByRole('radio', { name: /^אתרים/ });
  await webRadio.check();
  const snapAfter = await page.locator('[data-work-index]').ariaSnapshot();
  const statusText = (await page.getByRole('status').filter({ hasText: 'עבוד' }).first().textContent()) ?? '';
  check(
    `[${dir}] filters: state exposed (radio checked + status)`,
    (await webRadio.isChecked()) && /radio "אתרים[^"]*" \[checked\]/.test(snapAfter) && /מוצג/.test(statusText),
    `${statusText} | ${(snapAfter.match(/radio "[^"]*" \[checked\]/) ?? [''])[0]}`,
  );
  await writeFile(path.join(out, `work-index-filtered--${dir}.aria.yml`), snapAfter);

  // Form errors exposed: invalid + error message + description, focus on first invalid field
  await page.goto(`${site}/contact/?direction=${dir}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'שליחה' }).click();
  const nameBox = page.getByRole('textbox', { name: /^שם/ });
  let errOk = true;
  let detail = '';
  try {
    await expect(nameBox).toHaveAttribute('aria-invalid', 'true');
    await expect(nameBox).toHaveAccessibleErrorMessage('כתבו שם.');
    await expect(nameBox).toHaveAccessibleDescription(/כתבו שם/);
    await expect(nameBox).toBeFocused();
    await expect(page.getByRole('checkbox', { name: /קראתי את מדיניות הפרטיות/ })).toHaveAccessibleErrorMessage(/מדיניות הפרטיות/);
    await expect(page.getByRole('combobox', { name: /במה אפשר לעזור/ })).toHaveAccessibleErrorMessage('בחרו במה אפשר לעזור.');
  } catch (e) {
    errOk = false;
    detail = e instanceof Error ? e.message.split('\n')[0] : String(e);
  }
  const formSnap = await page.locator('form[data-lead-form]').ariaSnapshot();
  await writeFile(path.join(out, `contact-errors--${dir}.aria.yml`), formSnap);
  check(`[${dir}] form errors: aria-invalid, error message, description, focus`, errOk, detail);

  // Brief group disclosure: announced, group named by its legend
  await page.goto(`${site}/contact/?direction=${dir}`, { waitUntil: 'networkidle' });
  await page.getByRole('combobox', { name: /במה אפשר לעזור/ }).selectOption('web');
  const briefGroup = page.getByRole('group', { name: /על האתר/ });
  const live = (await page.locator('[data-brief-live]').textContent()) ?? '';
  check(`[${dir}] brief group: exposed as a named group and announced`, (await briefGroup.isVisible()) && /על האתר/.test(live), live);
  await ctx.close();
}

await browser.close();
server.close();
const passed = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` :: ${r.detail}`}`);
console.log(`\n${passed}/${results.length} passed. Snapshots: ${path.relative(root, out) || out}`);
await writeFile(path.join(root, 'qa-report-aria.json'), JSON.stringify({ passed, total: results.length, results }, null, 2));
if (passed !== results.length) process.exitCode = 1;
