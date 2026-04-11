# Timetable assistant (MVP)

This document describes the **assisted weekly timetable** feature: admins define **per-class** subject/teacher/periods-per-week rows; the app **greedily** places weekly `Lesson` templates into **Mon–Fri × bell periods**, then **commits** real rows to the database.

It complements [LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md](../scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md) §8.

---

## User flow

1. **Prerequisites:** Active bell schedule ([Bell schedule](../scheduling/BELL_SCHEDULE_IMPLEMENTATION.md) / admin setup), subjects, teachers (linked to subjects), classes, rooms (optional).
2. Open **Timetable assistant** (`/schools/{schoolId}/admin/timetable-assistant`) from the menu or Scheduling setup.
3. Select a **class** and enter one or more **requirement rows**:
   - Subject (must be taught by the selected teacher)
   - Teacher
   - Periods per week (integer: how many such **blocks** per week)
   - **Block size** (optional, default 1): consecutive bell periods in each block; must be contiguous in the school’s period `order` (e.g. 2 = double period).
   - Optional room (conflicts if another lesson uses the same room at overlapping time)
4. **Preview** — no database writes. Review the proposed grid and any policy/unplaced warnings.
   - **Preview (greedy)** — fast deterministic placement (default).
   - **Preview (CP-SAT)** — shown only when the server has `TIMETABLE_SOLVER_ENABLED=1` and the [Python solver](../../services/timetable-solver/) is configured. Same hard rules as greedy plus soft goals (F.3). Use **Greedy** / **CP-SAT** tabs to compare when both have been run.
5. **Commit** — creates `Lesson` rows in a transaction from the **selected** preview (greedy or CP-SAT tab). Optionally **replace** existing weekly templates for that class first.
6. **Term sessions** — open **Admin schedule** for the school (`/schools/{schoolId}/admin/schedule`) and run **Generate lesson sessions for this term** so the calendar shows dated `LessonSession` rows (same as manual templates).

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/schools/{schoolId}/timetable-assistant/preview` | Stateless preview JSON |
| `POST` | `/api/schools/{schoolId}/timetable-assistant/commit` | Commit templates (admin only) |
| `POST` | `/api/schools/{schoolId}/timetable-assistant/preview-school` | Multi-class / scoped school preview (admin only) |
| `POST` | `/api/schools/{schoolId}/timetable-assistant/commit-school` | Scoped commit + optional term sync (admin only) |
| `GET` | `/api/schools/{schoolId}/timetable-assistant/grade-templates` | List saved per-grade requirement templates (`gradeId`, `updatedAt`) |
| `GET` | `/api/schools/{schoolId}/timetable-assistant/grade-templates/{gradeId}` | One template’s `rowsJson` (class-agnostic requirement rows) |
| `PUT` | `/api/schools/{schoolId}/timetable-assistant/grade-templates/{gradeId}` | Upsert template rows (Zod: `timetableAssistantSchoolTemplateRowsSchema`; admin only) |
| `POST` | `/api/schools/{schoolId}/timetable-assistant/preview-optimize` | CP-SAT **optimize** preview — hard constraints (F.2) + soft goals SG1–SG4 (F.3); same body as `preview`; requires env + [Python solver](../../services/timetable-solver/) |
| `POST` | `/api/schools/{schoolId}/timetable-assistant/preview-optimize-school` | School-scoped CP-SAT optimize preview (same body as `preview-school`) |

**Optimizer env:** `TIMETABLE_SOLVER_ENABLED=1`, `TIMETABLE_SOLVER_URL` (e.g. `http://localhost:8000`), `TIMETABLE_SOLVER_SECRET` (must match the solver service). **Optional:** `TIMETABLE_SOLVER_FEASIBILITY_ONLY=1` forces **feasibility-only** (`POST /solve-feasibility`) for debugging — no soft objective. **Limits:** max **300** expanded placement tasks; **30s** timeout. Errors: `SOLVER_DISABLED`, `SOLVER_UNAVAILABLE`, `SOLVER_TOO_LARGE`, `INFEASIBLE`, `SOLVER_TIMEOUT`, etc. Greedy `preview` / `preview-school` unchanged and need no solver.

Body (Zod: `timetableAssistantBodySchema` in [`formValidationSchemas.ts`](../../src/lib/formValidationSchemas.ts)):

```json
{
  "classId": 1,
  "replaceExistingClassLessons": false,
  "requirements": [
    { "subjectId": 2, "teacherId": "...", "periodsPerWeek": 3, "blockSize": 1, "roomId": null }
  ]
}
```

`blockSize` is optional (default `1`, max `8` in Zod: `TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX`). Whole-school bodies use the same field on each requirement row (see `timetableAssistantSchoolRequirementSchema`).

---

## Algorithm (greedy)

Implementation: [`src/lib/domain/timetableAssistant.ts`](../../src/lib/domain/timetableAssistant.ts).

- Expands each requirement into `periodsPerWeek` placement tasks; each task has **`blockSize`** consecutive periods (1 = one period per block).
- Iterates tasks in order; for each task, scans **Monday → Friday**, then valid **contiguous period spans** of length `blockSize` (ascending by period order).
- A slot is valid if **no overlap** on that weekday with:
  - same **teacher** (any class),
  - same **class**,
  - same **room** (only when both lessons have a room).
- Existing `Lesson` rows in the school are treated as occupied (except the target class’s rows when **replace** is enabled).
- If `sum(periodsPerWeek × blockSize) > 5 × numberOfPeriods` for that class, placement fails with **capacity**. If `blockSize` exceeds the longest contiguous run of periods in the bell schedule, rows fail **capacity** for that task.

This is **not** a global optimizer; quality depends on row order and existing load. For **CP-SAT** placement with soft goals when the solver is enabled, use **Preview (CP-SAT)** in the admin UI (see § User flow).

---

## Validation parity with manual `Lesson` create

[`src/lib/timetableAssistantService.ts`](../../src/lib/timetableAssistantService.ts) enforces:

- Teacher teaches subject (Prisma `subjects` relation).
- Bell policy via `validateLessonTimesAgainstBellPolicy` (single period, or **multi-period** span via `periodSpan` when `endPeriodId` is set on the proposal).
- Teacher **unavailable** windows (same logic as [`createLesson`](../../src/lib/actions.ts)).
- Room exists for the school when `roomId` is set.

---

## Term session sync after commit

Manual **single lesson** create calls `syncLessonTemplateToCurrentTermSessions` per lesson (class-scoped `generateTermLessons` per active term).

The timetable assistant **batch** instead runs one **class-scoped** `generateTermLessons` **commit** per active term after all inserts, avoiding N duplicate generation passes. If the scheduling pipeline commit flag is off for the school, lessons are still created; term sync is skipped (same behavior as other scheduling commits).

---

## Files

| Area | Path |
|------|------|
| Domain | `src/lib/domain/timetableAssistant.ts` |
| Feasibility + solver client | `src/lib/domain/timetableFeasibility.ts`, `src/lib/domain/timetableSoftGoals.ts`, `src/lib/domain/timetableSolverFeasibility.ts` |
| Service | `src/lib/timetableAssistantService.ts` |
| Preview API | `src/app/api/schools/[schoolId]/timetable-assistant/preview/route.ts` |
| Commit API | `src/app/api/schools/[schoolId]/timetable-assistant/commit/route.ts` |
| School preview API | `src/app/api/schools/[schoolId]/timetable-assistant/preview-school/route.ts` |
| School commit API | `src/app/api/schools/[schoolId]/timetable-assistant/commit-school/route.ts` |
| Optimize preview APIs | `.../preview-optimize/route.ts`, `.../preview-optimize-school/route.ts` |
| Python CP-SAT service | [`services/timetable-solver/`](../../services/timetable-solver/) |
| UI | `src/app/(dashboard)/schools/[schoolId]/admin/timetable-assistant/` — greedy + optional CP-SAT preview (F.4) |
| Whole-school UI | `src/app/(dashboard)/schools/[schoolId]/admin/timetable-assistant/school/` — same |
| Matrix / templates domain | `src/lib/domain/timetableRequirementMatrix.ts` |
| Grade template APIs | `src/app/api/schools/[schoolId]/timetable-assistant/grade-templates/` |
| Tests | `tests/unit/timetableAssistant.test.ts`, `tests/unit/timetableRequirementMatrix.test.ts` |

---

## Whole-school draft (v1)

Multi-class drafting (shared **global** teacher/class/room occupancy) **parallel** to the MVP: same validation patterns in [`timetableAssistantService.ts`](../../src/lib/timetableAssistantService.ts), different scope and body.

**UI:** `/schools/{schoolId}/admin/timetable-assistant/school`

- **Table mode** — flat requirement rows (unchanged).
- **Matrix mode** — class × subject grid: default teacher per subject column, periods per cell (0 = none), optional per-cell teacher override; **block size** and **room** are single global defaults for all non-zero cells (see UI help). Horizontal scroll on small screens.
- **Per-grade templates** — load/save/apply prototype rows per `gradeId` (stored in `TimetableGradeTemplate.rowsJson`). Save uses the **first class in scope** as the prototype row for subject lines. Apply fans out to all classes in scope (replace or merge). Preview/commit payloads are unchanged (`timetableAssistantSchoolBodySchema`).

**API:**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/schools/{schoolId}/timetable-assistant/preview-school` | Preview JSON (summary + proposals + policy errors) |
| `POST` | `/api/schools/{schoolId}/timetable-assistant/preview-optimize-school` | CP-SAT optimize preview (same body; env + solver as above) |
| `POST` | `/api/schools/{schoolId}/timetable-assistant/commit-school` | Scoped delete + insert; term sync when pipeline enabled |
| `GET` | `/api/schools/{schoolId}/timetable-assistant/grade-templates` | List templates (`gradeId`, `updatedAt`) |
| `GET` | `/api/schools/{schoolId}/timetable-assistant/grade-templates/{gradeId}` | Template `rowsJson` |
| `PUT` | `/api/schools/{schoolId}/timetable-assistant/grade-templates/{gradeId}` | Upsert `rowsJson` |

Body (Zod: `timetableAssistantSchoolBodySchema`): `scope` (`school` | `grade` + `gradeId` | `classIds` + `ids`), `requirements` (each row includes `classId` and optional `blockSize`), `replaceScope` (`none` | `affected_classes` | `school`). Max **200** requirement rows — the matrix UI enforces this when flattening.

**Domain:** flat ↔ matrix helpers and caps — [`src/lib/domain/timetableRequirementMatrix.ts`](../../src/lib/domain/timetableRequirementMatrix.ts).

Algorithm details, phased roadmap, and risks: [TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md](./TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md).

**Preview vs teacher availability:** Greedy preview skips slots that would fail commit validation for teacher-marked **unavailable** windows (same rules as commit). **Phase F.1** shipped; implementation: [`timetableTeacherAvailability.ts`](../../src/lib/domain/timetableTeacherAvailability.ts), [`timetableAssistant.ts`](../../src/lib/domain/timetableAssistant.ts).

**Phase F:** **F.1**–**F.4** shipped — APIs + admin UI for greedy vs CP-SAT preview ([TIMETABLE_SOLVER_PHASE_F_DESIGN.md](./TIMETABLE_SOLVER_PHASE_F_DESIGN.md), [TIMETABLE_SOLVER_F4_IMPLEMENTATION.md](./TIMETABLE_SOLVER_F4_IMPLEMENTATION.md), [TIMETABLE_SOLVER_F3_IMPLEMENTATION.md](./TIMETABLE_SOLVER_F3_IMPLEMENTATION.md)).

---

## Manual QA (F.4)

Prerequisites: `.env` with `TIMETABLE_SOLVER_ENABLED=1`, `TIMETABLE_SOLVER_URL`, `TIMETABLE_SOLVER_SECRET`; Python solver running (`services/timetable-solver/`).

1. Open `/schools/{schoolId}/admin/timetable-assistant` as admin. Confirm **Preview (CP-SAT)** is visible.
2. Run **Preview (greedy)** — grid appears; note placement.
3. Run **Preview (CP-SAT)** — grid appears; **Greedy** / **CP-SAT** tabs allow switching.
4. Switch to CP-SAT tab, **Commit** — templates match CP-SAT grid (same requirements body).
5. With `TIMETABLE_SOLVER_ENABLED` unset or `0`, restart app — CP-SAT button hidden; greedy still works.
6. Optional: whole-school page `/admin/timetable-assistant/school` — same button and tab behavior.

---

## Document history

- **Added:** MVP implementation for assisted weekly timetable.
- **Updated:** F.4 admin UI (greedy vs CP-SAT); manual QA checklist.
- **Updated:** F.3 soft-goal optimize + `TIMETABLE_SOLVER_FEASIBILITY_ONLY` on `preview-optimize` routes.
- **Updated:** Link to whole-school draft plan; whole-school v1 endpoints and UI.
- **Updated:** Whole-school matrix mode, per-grade templates (`TimetableGradeTemplate`), grade-template APIs, `timetableRequirementMatrix` helpers.
