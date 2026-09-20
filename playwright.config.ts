/**
 * ══════════════════════════════════════════════════════════════════════════
 * PLAYWRIGHT — the real site, in a real browser, against the local stack.
 *
 * Nothing here reaches a provider. The global setup starts the PayPal and
 * Beds24 simulators, builds the site once and serves it with `next start`
 * pointed at them; every test then drives Chromium through the public
 * booking dialog or BoLaGio Control and asserts the database afterwards.
 *
 * Prerequisite: the local stack is up (`npm run stack:up`). CI starts it.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * A Chromium supplied by the environment (E2E_CHROMIUM, or the image's
 * /opt/pw-browsers link) is used when present, so the suite runs without a
 * browser download; CI installs the pinned one with `playwright install`.
 */
const executablePath = [process.env.E2E_CHROMIUM, '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // One database, one simulator pair: tests reset shared state and run in order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    launchOptions,
  },
  projects: [
    { name: 'guest', testMatch: /guest\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'guest-mobile', testMatch: /guest\/mobile\.spec\.ts/, use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'admin', testMatch: /admin\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
});
