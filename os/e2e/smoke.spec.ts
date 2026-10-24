import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env['SHOTS_DIR'] ?? path.resolve(import.meta.dirname, '..', 'shots');
mkdirSync(SHOTS, { recursive: true });

/** Fail on any request that leaves the local preview server: Studio OS never calls real services. */
async function guardNetwork(page: Page): Promise<string[]> {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.protocol === 'data:') return route.continue();
    external.push(url.href);
    return route.abort();
  });
  return external;
}

async function signInAsOwner(page: Page) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: /כניסה כבעלי הסטודיו/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'מה מחכה לך היום' })).toBeVisible();
}

async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${String(v.nodes.length)}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

async function noHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(0);
}

test('smoke: dashboard → convert a lead → new project on the board, moved by keyboard', async ({ page }) => {
  const external = await guardNetwork(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAsOwner(page);

  await expect(page.getByRole('region', { name: 'מצב דמו' })).toBeVisible();
  const leadsPanel = page.getByRole('region', { name: 'לידים חדשים' });
  await leadsPanel.getByRole('link', { name: /פונה לדוגמה ד׳/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'פונה לדוגמה ד׳' })).toBeVisible();

  const form = page.getByRole('form', { name: 'המרה ללקוח ולפרויקט' });
  await form.getByLabel('שם הפרויקט').fill('קליפ לילה בעיר');
  await form.getByRole('radio', { name: 'פנייה' }).check();
  await form.getByRole('button', { name: 'המרה ללקוח ופרויקט' }).click();

  await expect(page).toHaveURL(/\/projects\?focus=/);
  const inquiry = page.getByRole('region', { name: /^פנייה/ });
  const card = inquiry.getByRole('listitem').filter({ hasText: 'קליפ לילה בעיר' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: 'קליפ לילה בעיר' })).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'הליד הומר' })).toBeVisible();

  // Keyboard-only move to the next stage: Tab to the card's move button, press Enter.
  await page.keyboard.press('Tab');
  await expect(card.getByRole('button', { name: 'העברה לשלב הצעה' })).toBeFocused();
  await page.keyboard.press('Enter');
  const proposal = page.getByRole('region', { name: /^הצעה/ });
  const moved = proposal.getByRole('listitem').filter({ hasText: 'קליפ לילה בעיר' });
  await expect(moved).toBeVisible();
  await expect(moved.getByRole('button', { name: 'העברה לשלב טרום הפקה' })).toBeFocused();

  // The lead is now converted, and the client exists.
  await page.goto('/leads?show=converted');
  await expect(page.getByRole('link', { name: 'פונה לדוגמה ד׳' })).toBeVisible();
  await page.goto('/clients');
  await expect(page.getByRole('link', { name: 'פונה לדוגמה ד׳' })).toBeVisible();

  expect(external).toEqual([]);
});

test('quote builder: live totals with VAT, send goes to the outbox only', async ({ page }) => {
  const external = await guardNetwork(page);
  await signInAsOwner(page);
  await page.goto('/projects/demo-prj-5/quote');
  const form = page.getByRole('form', { name: /עריכת הצעה/ });
  await expect(form).toBeVisible();
  // 8 × ₪650 = ₪5,200 net → VAT ₪936 → total ₪6,136
  await expect(form.locator('output')).toContainText('6,136.00');
  await form.getByLabel('מחיר ליחידה בשקלים, שורה 1').fill('700');
  await expect(form.locator('output')).toContainText('6,608.00');
  // Private client (no tax id): no allocation number, whatever the amount.
  await expect(form.getByText(/מספר הקצאה/)).toHaveCount(0);
  await form.getByLabel('הנחה (₪, לפני מע״מ)').fill('600');
  // 5,600 − 600 = 5,000 net → 900 VAT → 5,900
  await expect(form.locator('output')).toContainText('5,900.00');
  await form.getByRole('button', { name: 'שליחה ללקוח' }).click();
  await expect(page.getByText('נשלחה', { exact: true })).toBeVisible();
  await page.goto('/outbox');
  await expect(page.getByText(/מייל ״הצעת מחיר Q-DEMO-005/)).toBeVisible();

  // Business client: a draft at ₪5,000 net shows the allocation-number requirement; ₪4,999.99 does not.
  await page.goto('/projects/demo-prj-8/quote');
  await page.getByRole('button', { name: 'יצירת טיוטה' }).click();
  const draft = page.getByRole('form', { name: /עריכת הצעה/ });
  await draft.getByLabel('תיאור שורה 1').fill('טיזר');
  await draft.getByLabel('מחיר ליחידה בשקלים, שורה 1').fill('4,999.99');
  await expect(draft.locator('output')).toContainText('5,899.99');
  await expect(draft.getByText(/מספר הקצאה/)).toHaveCount(0);
  await draft.getByLabel('מחיר ליחידה בשקלים, שורה 1').fill('5000');
  await expect(draft.getByText(/מספר הקצאה/)).toBeVisible();
  expect(external).toEqual([]);
});

const SCREENS: [string, string][] = [
  ['dashboard', '/'],
  ['leads', '/leads'],
  ['lead-detail', '/leads/demo-lead-2'],
  ['clients', '/clients'],
  ['client-detail', '/clients/demo-cli-c'],
  ['projects-board', '/projects'],
  ['project-overview', '/projects/demo-prj-1'],
  ['project-tasks', '/projects/demo-prj-1/tasks'],
  ['project-milestones', '/projects/demo-prj-1/milestones'],
  ['project-files', '/projects/demo-prj-1/files'],
  ['project-quote-accepted', '/projects/demo-prj-1/quote'],
  ['project-quote-draft', '/projects/demo-prj-5/quote'],
  ['project-quote-empty', '/projects/demo-prj-8/quote'],
  ['outbox', '/outbox'],
  ['portal-owner', '/portal'],
  ['not-found', '/nope'],
];

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`axe: every screen, ${scheme}, ${String(width)}px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const external = await guardNetwork(page);
      await page.goto('/sign-in');
      await axe(page, `sign-in ${scheme} ${String(width)}`);
      await page.getByRole('button', { name: /כניסה כבעלי הסטודיו/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      for (const [name, url] of SCREENS) {
        await page.goto(url);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await expect(page.locator('.state--loading')).toHaveCount(0);
        await axe(page, `${name} ${scheme} ${String(width)}`);
        await noHorizontalOverflow(page, `${name} ${scheme} ${String(width)}`);
        if (scheme === 'light' && (name === 'dashboard' || name === 'project-overview' || name === 'project-quote-draft')) {
          await page.screenshot({ path: path.join(SHOTS, `${name}-${String(width)}.png`), fullPage: true });
        }
      }
      if (width === 390) {
        await page.goto('/');
        await page.getByRole('button', { name: 'תפריט' }).click();
        await expect(page.getByRole('navigation', { name: 'ראשי' })).toBeVisible();
        await axe(page, `mobile menu open ${scheme}`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'תפריט' })).toHaveAttribute('aria-expanded', 'false');
      }
      // Client role sees only the portal.
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('studio-os:session', JSON.stringify({ role: 'client', clientId: 'demo-cli-a', displayName: 'לקוח לדוגמה א׳' })));
      await page.goto('/projects');
      await expect(page).toHaveURL(/\/portal$/);
      await expect(page.getByRole('heading', { level: 1, name: /שלום, לקוח לדוגמה א׳/ })).toBeVisible();
      await axe(page, `client portal ${scheme} ${String(width)}`);
      expect(external).toEqual([]);
    });
  }
}
