import { test, expect } from "@playwright/test";

/**
 * Calendar exceptions happy-path scenario.
 * Requires seeded admin credentials + school fixture; kept skipped in CI smoke by default.
 */
test.skip("admin can create holiday and see scheduling impact", async ({ page }) => {
  await page.goto("/join", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();

  // Intended full flow:
  // 1) Sign in as admin fixture user.
  // 2) Open /schools/:schoolId/admin/calendar-exceptions and create HOLIDAY in active term.
  // 3) Verify overlay appears on admin/teacher calendar.
  // 4) Trigger generation dry-run and assert holiday skip/conflict counters.
  // 5) Open exam form and verify EXAM_PERIOD options are term-scoped with date-range labels.
});
