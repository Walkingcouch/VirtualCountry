import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *  - e2e/public.spec.ts needs no database. It runs anywhere against a local production build.
 *  - e2e/flows.spec.ts signs in as the demo people, so it needs the demo database and NEXT_PUBLIC_DEMO_MODE=true.
 *    Run it with E2E_FULL=1. Never point it at a database holding real community material.
 */
const port = Number(process.env.E2E_PORT ?? 3210);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: `npx next start -p ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
