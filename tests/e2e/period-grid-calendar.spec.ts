import { test, expect } from "@playwright/test";

test.skip("period-grid calendar renders schedule shell", async ({ page }) => {
  await page.goto("/join", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();

  // Follow-up e2e path when authenticated fixture is available:
  // 1) sign in as admin/teacher fixture
  // 2) open schedule page
  // 3) assert period-grid headers and period rows render
  // 4) assert lesson/exam/exception elements are visible
});
