# E7 — Scheduling hardening, rollout, and rollback

This note complements [SCHEDULING_ASSESSMENT_TASK_BOARD.md](../../SCHEDULING_ASSESSMENT_TASK_BOARD.md) **E7** and **Phase 9** in [SCHEDULING_ASSESSMENT_ROADMAP.md](../../SCHEDULING_ASSESSMENT_ROADMAP.md).

## Feature flag (per school)

- **Field:** `School.schedulingPipelineEnabled` (default `true`).
- **Effect:** When `false`, **commit-style** scheduling operations return **403** with code `SCHEDULING_PIPELINE_DISABLED`:
  - `POST` … `/generate-term-schedule` with `mode: "commit"`
  - `POST` … `/exams/recurring/commit`
- **Dry-run** term generation (`mode: "dryRun"`) is **not** blocked by this flag (still subject to setup gating).
- **Setup status:** `GET` … `/setup/scheduling-status` includes `schedulingPipelineEnabled` and reflects it in `canGenerate` / blockers when disabled.

### Rollback procedure

1. Set `schedulingPipelineEnabled = false` for the affected school (SQL or admin tooling).
2. Verify admin UI: **Scheduling setup** shows pipeline disabled; **Scheduling diagnostics** lists recent runs.
3. Confirm users receive **403** on commit actions (no partial writes).
4. Re-enable by setting `schedulingPipelineEnabled = true` after fixes or pilot completion.

Example (PostgreSQL):

```sql
UPDATE "School" SET "schedulingPipelineEnabled" = false WHERE id = '<schoolId>';
```

## Observability

- **Structured logs:** JSON lines on stdout with `channel: "SCHEDULING"` (see `src/lib/schedulingLogger.ts`). Forward to your log drain / APM.
- **Audit tables:**
  - `TermScheduleGenerationLog` — term lesson generation (dry-run + commit).
  - `RecurringExamCommitLog` — recurring DS exam commits (including strict-mode conflicts and failures).
  - `LessonSessionOverrideAudit` — `PATCH` lesson session instance overrides.

## Admin diagnostics

- **UI:** `/schools/[schoolId]/admin/scheduling-diagnostics` (admin only).
- **API:** `GET /api/schools/[schoolId]/admin/scheduling-diagnostics` — recent rows from the audit tables + pipeline flag.

## Pilot checklist

1. Enable pipeline for **one** school and **one** term.
2. Run dry-run generation, then commit; run recurring preview then commit.
3. Watch logs and diagnostics for one full cycle before broad enablement.

## Developer tests

- **Unit + integration (Vitest):** `npm run test`
- **E2E smoke (Playwright):** start the app (`npm run dev`), then `npm run test:e2e`. First-time setup: `npx playwright install chromium`.

## Migration contingency

- New columns/tables are additive; disabling the pipeline does **not** require schema rollback.
- If a migration must be reverted, follow your standard Prisma rollback process and restore from backup; do not delete production data without a plan.
