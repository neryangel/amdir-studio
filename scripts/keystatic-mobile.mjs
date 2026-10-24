// Keystatic on a phone: add a work at 390px through the real admin UI, then check what was written.
// Acceptance: a clip can be added from a phone in under 5 minutes, with no horizontal scroll.
// Needs the dev server: `npm run dev` (Keystatic is dev-only). Usage: node scripts/keystatic-mobile.mjs [baseUrl]
// The test entry is always removed afterwards, pass or fail.
import { readFile, rm } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:4321";
const slug = "keystatic-mobile-check";
const yamlPath = `src/content/works/${slug}.yaml`;
const assetDir = `src/assets/works/${slug}`;
const image = "src/assets/services/video/cover.png";

const failures = [];
const expect = (ok, msg) => ok || failures.push(msg);

const chromeDir = existsSync("/opt/pw-browsers")
  ? readdirSync("/opt/pw-browsers").find((d) => /^chromium-\d+$/.test(d))
  : undefined;
const executablePath =
  process.env.CHROME_PATH ??
  (chromeDir ? `/opt/pw-browsers/${chromeDir}/chrome-linux/chrome` : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ["--no-sandbox"],
});
try {
  const page = await (
    await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: 390, height: 844 },
    })
  ).newPage();
  const t0 = Date.now();
  await page.goto(`${base}/keystatic/collection/works/create`, {
    waitUntil: "networkidle",
  });

  const [scrollW, viewW] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    innerWidth,
  ]);
  expect(scrollW <= viewW, `horizontal scroll: ${scrollW} > ${viewW}`);

  await page.getByLabel("כותרת", { exact: true }).fill("בדיקת טלפון");
  await page.getByLabel(/כתובת \(slug\)/).fill(slug);
  await page.getByRole("checkbox", { name: "קליפים", exact: true }).check();
  await page.getByLabel(/^שנה/).fill("2026");
  await page
    .getByLabel(/^המטרה/)
    .fill("בדיקה אוטומטית של הוספת עבודה מהטלפון.");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page
      .getByRole("button", { name: /choose file/i })
      .first()
      .click(),
  ]);
  await chooser.setFiles(image);
  await page.getByLabel(/טקסט חלופי לתמונת הפתיחה/).fill("תמונת בדיקה");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(new RegExp(`/item/${slug}$`), { timeout: 20_000 });
  const secs = (Date.now() - t0) / 1000;

  expect(existsSync(yamlPath), `${yamlPath} was not written`);
  expect(existsSync(`${assetDir}/poster.png`), "poster was not saved");
  const yaml = existsSync(yamlPath) ? await readFile(yamlPath, "utf8") : "";
  expect(
    /^placeholder: false$/m.test(yaml),
    "a new work must not default to placeholder (it would be hidden in production)",
  );
  expect(/^  - clips$/m.test(yaml), "discipline not saved");
  expect(secs < 300, `took ${secs}s`);
  console.log(
    `keystatic mobile: saved in ${secs.toFixed(1)}s (automated; a person typing needs more)`,
  );
} finally {
  await browser.close();
  await rm(yamlPath, { force: true });
  await rm(assetDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}
console.log("✓ keystatic mobile add-work check passed");
