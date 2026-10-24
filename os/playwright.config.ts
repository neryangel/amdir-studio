import { existsSync, readdirSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Local sandbox: system Chromium under /opt/pw-browsers (same approach as the root scripts/qa.mjs).
// CI: browsers installed by `npx playwright install`, or CHROME_PATH.
const chromeDir = existsSync('/opt/pw-browsers') ? readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d)) : undefined;
const executablePath = process.env['CHROME_PATH'] ?? (chromeDir ? `/opt/pw-browsers/${chromeDir}/chrome-linux/chrome` : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4590',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4590',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
