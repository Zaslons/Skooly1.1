import { test } from "@playwright/test";

/**
 * Phase 6 optional E2E: full bell-flow needs authenticated admin.
 * Skipped until auth fixtures or E2E_FULL + programmatic login exist.
 *
 * Future outline (manual / env-gated):
 * 1. login as admin (e.g. admin1 / Password123! on seeded DB)
 * 2. goto /schools/{schoolId}/admin/setup/bell-schedule
 * 3. create or verify a Period row (name, start/end within school hours)
 * 4. goto schedule / lesson form and create lesson with period slot
 * 5. calendar view: assert session or lesson appears for expected day
 */
test.skip("admin bell schedule → lesson → calendar (requires auth)", async () => {
  // Implement when E2E auth is available; see comment block above.
});
