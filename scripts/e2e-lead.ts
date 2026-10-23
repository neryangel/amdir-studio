// End-to-end: real built page + real handler (JSONL store) + Playwright + axe.
// Run: npm run e2e:lead   (builds dist-e2e with PUBLIC_LEAD_ENDPOINT=/api/lead first)
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { startLocalServer } from './local-server';

const root = path.resolve(import.meta.dirname, '..');
const shots = path.resolve(process.argv[2] ?? path.join(root, 'qa-shots', 'lead'));
const jsonl = path.join(root, '.leads', 'e2e.jsonl');
await rm(jsonl, { force: true });
await mkdir(shots, { recursive: true });

const server = await startLocalServer({ dir: path.join(root, 'dist-e2e'), jsonl, rateLimit: 1000 });
const chromeDir = existsSync('/opt/pw-browsers') ? readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d)) : undefined;
const executablePath = process.env.CHROME_PATH ?? (chromeDir ? `/opt/pw-browsers/${chromeDir}/chrome-linux/chrome` : undefined);
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });

const results: { name: string; ok: boolean; detail?: string }[] = [];
const axeFindings: { state: string; id: string; impact: string | null | undefined; nodes: number }[] = [];
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, ...(detail ? { detail } : {}) });
const lineCount = async () => (existsSync(jsonl) ? (await readFile(jsonl, 'utf8')).trim().split('\n').filter(Boolean).length : 0);

async function fill(page: Page, prefix: string, need?: string) {
  await page.fill(`#${prefix}-name`, 'בדיקת קצה');
  await page.fill(`#${prefix}-reach`, 'e2e@example.com');
  if (need) await page.selectOption(`#${prefix}-need`, need);
  await page.fill(`#${prefix}-details`, 'פנייה לבדיקה מקצה לקצה');
  await page.check(`#${prefix}-privacy`);
}

async function axe(page: Page, state: string) {
  const r = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of r.violations) axeFindings.push({ state, id: v.id, impact: v.impact, nodes: v.nodes.length });
}

const variants = [
  { dir: 'stage', q: 'direction=stage', scheme: 'dark' as const },
  { dir: 'index', q: 'direction=index&theme=light', scheme: 'light' as const },
];

for (const v of variants) {
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: v.scheme, locale: 'he-IL' });
    const page = await ctx.newPage();
    const tag = `${v.dir}-${width}`;

    // success path
    server.setStoreMode('ok');
    const before = await lineCount();
    await page.goto(`${server.url}/contact/?${v.q}`, { waitUntil: 'networkidle' });
    await fill(page, 'contact', 'web');
    await page.waitForTimeout(3200); // time-trap
    await page.click('form[data-lead-form] button[type=submit]');
    await page.waitForSelector('form[data-state="sent"]', { timeout: 10_000 });
    const okText = (await page.textContent('#contact-status')) ?? '';
    const focused = await page.evaluate(() => document.activeElement?.id);
    const after = await lineCount();
    check(`[${tag}] success: message + focus + stored`, okText.includes('הפנייה התקבלה') && focused === 'contact-status' && after === before + 1, `${okText} | focus=${focused} | lines ${before}->${after}`);
    await page.locator('#contact-status').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, `contact-success--${tag}.png`), fullPage: false });
    await axe(page, `success ${tag}`);

    // failure path (store down)
    server.setStoreMode('fail');
    await page.goto(`${server.url}/contact/?${v.q}`, { waitUntil: 'networkidle' });
    await fill(page, 'contact', 'clip');
    await page.waitForTimeout(3200);
    await page.click('form[data-lead-form] button[type=submit]');
    await page.waitForSelector('form[data-state="error"]', { timeout: 10_000 });
    const errText = (await page.textContent('#contact-status')) ?? '';
    const wa = await page.locator('#contact-status a').getAttribute('href');
    const kept = (await page.inputValue('#contact-name')) === 'בדיקת קצה' && (await page.inputValue('#contact-details')).length > 0;
    check(`[${tag}] store failure: Hebrew error + WhatsApp + data kept, nothing stored`, errText.includes('לא נשמרו') && !!wa && kept && (await lineCount()) === after, `${errText} | wa=${wa}`);
    await page.locator('#contact-status').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, `contact-error--${tag}.png`), fullPage: false });
    await axe(page, `error ${tag}`);
    await ctx.close();
  }
}

// time-trap from the real page: submit immediately
{
  server.setStoreMode('ok');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const before = await lineCount();
  await page.goto(`${server.url}/contact/`, { waitUntil: 'networkidle' });
  await fill(page, 'contact', 'ai');
  await page.click('form[data-lead-form] button[type=submit]');
  await page.waitForSelector('form[data-state="error"]', { timeout: 10_000 });
  const t = (await page.textContent('#contact-status')) ?? '';
  check('time-trap: instant submit is refused, nothing stored', t.includes('רגע אחד') && (await lineCount()) === before, t);

  // pilot form on the product page
  await page.goto(`${server.url}/products/event-pro-studio/`, { waitUntil: 'networkidle' });
  await fill(page, 'pilot');
  await page.waitForTimeout(3200);
  await page.click('form[data-lead-form] button[type=submit]');
  await page.waitForSelector('form[data-state="sent"]', { timeout: 10_000 });
  const rows = (await readFile(jsonl, 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
  const last = rows.at(-1) ?? {};
  check(
    'pilot form: stored with source=pilot and consent record',
    last.source === 'pilot' && last.need === 'pilot' && last.privacy_consent === true && last.marketing_opt_in === false && typeof last.notice_version === 'string' && typeof last.consent_at === 'string',
    JSON.stringify({ source: last.source, need: last.need, notice_version: last.notice_version, marketing_opt_in: last.marketing_opt_in }),
  );
  const hp = await page.evaluate(() => {
    const el = document.getElementById('pilot-website');
    const box = el?.closest('.hp');
    const r = box?.getBoundingClientRect();
    return { hidden: box?.getAttribute('aria-hidden'), tab: el?.getAttribute('tabindex'), w: r?.width ?? 99, opacity: box ? getComputedStyle(box).opacity : '1' };
  });
  check('honeypot field is hidden from people (aria-hidden, tabindex -1, 1px, opacity 0)', hp.hidden === 'true' && hp.tab === '-1' && hp.w <= 1 && hp.opacity === '0', JSON.stringify(hp));
  await ctx.close();
}

await browser.close();
await server.close();

const summary = {
  checks: results.length,
  passed: results.filter((r) => r.ok).length,
  axeViolations: axeFindings.length,
  axe: axeFindings,
  results: results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` :: ${r.detail ?? ''}`}`),
};
await writeFile(path.join(root, 'qa-report-lead.json'), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.passed !== summary.checks || axeFindings.length) process.exitCode = 1;
