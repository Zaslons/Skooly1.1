import { test, expect } from "@playwright/test";

/**
 * Minimal E7 smoke: app responds on public join route (no auth).
 * Full admin setup → generate → calendar flow requires seeded data + credentials.
 */
test("join page loads", async ({ page }) => {
  const res = await page.goto("/join", { waitUntil: "domcontentloaded" });
  expect(res?.ok() ?? false).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
});
