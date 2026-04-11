import { defineConfig, devices } from "@playwright/test";

/**
 * E7 smoke: run against a local dev server (`npm run dev`) unless `PLAYWRIGHT_BASE_URL` is set.
 * Example: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test`
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
