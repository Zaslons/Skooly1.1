# Plan: Option C (multi-period / double-block lessons) + “periods only” UI

Use this document to implement in your **main/local repo** (or another chat). It assumes the current Skooly stack: `Lesson` weekly templates, `Period` bell rows, `LessonSession` generation from templates, `validateLessonTimesAgainstBellPolicy` / `bellPeriodRules.ts`, strict grid in `getSchedulingSetupStatus`.

---

## Goals

### A — Option C (first-class multi-period span)

- A lesson can span **more than one consecutive bell period** (e.g. “double block” = Period 3 + Period 4).
- **Single instructional unit** in the DB (one `Lesson` row), not two duplicate rows for the same subject/class/day.
- Generated `LessonSession` rows should still get correct **start/end** times: **start = first period’s start**, **end = last period’s end** (on the same weekly anchor used today for templates).

### B — “Periods only”

- When the school has **at least one active** (`isArchived: false`) `Period`:
  - **Require** a period selection (and span selection if Option C is implemented).
  - **Do not** expose free-form `startTime` / `endTime` pickers in the lesson form (times are **derived** from selected period(s)).
- When the school has **no** active periods (legacy / empty bell):
  - Keep **existing behavior**: manual times with **8:00–17:00** (or current fallback) validation, no `periodId` required.

---

## Design decisions (lock before coding)

1. **How to store multi-period in Prisma**
   - **Recommended (simple):** add **`endPeriodId`** (nullable `String?`, FK to `Period`) alongside existing **`periodId`** (meaning **start period**).
     - **Single-period lesson:** `endPeriodId === null` (or `endPeriodId === periodId` — pick one rule and enforce consistently).
     - **Multi-period:** `periodId` = first period, `endPeriodId` = last period; **validation** requires they are **distinct**, **same `schoolId`**, **non-archived**, and **consecutive in `order`** (or consecutive by time-of-day on the anchor date — prefer **`order`** for clarity).
   - **Alternative (more flexible, more work):** `LessonPeriod` join table `(lessonId, periodId, order)` for N periods. Use if you need non-contiguous spans (rare); otherwise `endPeriodId` is enough for “double/triple block.”

2. **Denormalized times on `Lesson`**
   - Keep **`startTime` / `endTime`** as today (needed for queries and generation).
   - On create/update: **always** set from **first period start** and **last period end** via `mergePeriodTimesOntoAnchor` (or equivalent) when period(s) are selected.

3. **`updateLessonTime` (calendar drag/resize)**
   - With periods-only, dragging might **clear** span and set to **single** period that best matches the new slot, or **disable** drag for period-locked schools — **product choice**. Document: either **periodId/endPeriodId = null** after drag (custom time) **conflicts** with periods-only — likely **disable** calendar time edits when `activePeriodCount > 0` or snap to nearest period boundary.

4. **Backward compatibility**
   - Existing rows: `periodId` set, `endPeriodId` null → **single-period** lessons.
   - Migrations: add nullable `endPeriodId` with FK to `Period` `ON DELETE SET NULL`.

---

## Step-by-step implementation checklist

### 1. Schema (`prisma/schema.prisma`)

- [ ] Add `endPeriodId String?` on `Lesson` with relation `endPeriod Period?` (separate relation name from `period`, e.g. `@relation("LessonEndPeriod", ...)`).
- [ ] `@@index` if needed for lookups (optional).
- [ ] Run `npx prisma migrate dev` with a descriptive name, e.g. `add_lesson_end_period_for_multi_block`.

### 2. SQL migration

- [ ] `ALTER TABLE "Lesson" ADD COLUMN "endPeriodId" TEXT;`
- [ ] FK: `"Lesson_endPeriodId_fkey"` → `"Period"("id")` `ON DELETE SET NULL` (same as `periodId`).
- [ ] Index optional.

### 3. Domain helpers (`src/lib/domain/bellPeriodRules.ts`)

- [ ] **`getContiguousPeriodRange(schoolId, startPeriodId, endPeriodId, prisma)`**  
  Loads periods, ensures same school, not archived, `order` of start ≤ `order` of end, and **every integer order between** exists (or at least no gaps — define “consecutive” strictly).
- [ ] **`computeLessonTimesFromPeriodSpan(anchorDate, startPeriod, endPeriod)`**  
  Returns `{ startTime, endTime }` for the template row.
- [ ] **`validateLessonPeriodSpan(...)`**  
  Throws / returns `BellPeriodError` if invalid span.
- [ ] Update **`validateLessonTimesAgainstBellPolicy`** (or callers) so that when **both** `periodId` and `endPeriodId` are set, the **interval** `[startTime, endTime]` equals the **union** of contiguous periods (or validate interval lies within merged span — should match exactly if derived from periods).

### 4. Zod / forms (`src/lib/formValidationSchemas.ts`)

- [ ] Extend **`lessonSchema`** with optional `endPeriodId` (CUID, optional empty string → undefined).
- [ ] Refine: if `endPeriodId` is set, `periodId` must be set; `endPeriodId` must differ from `periodId` for true multi-block OR allow equality for single-period (prefer **null** for single to avoid ambiguity).

### 5. Server actions (`src/lib/actions.ts`)

- [ ] **`createLesson` / `updateLesson`:**
  - [ ] If school has **active periods** (query `period.count` where `isArchived: false`):
    - [ ] **Require** `periodId` (periods-only).
    - [ ] Resolve `endPeriodId`: null → single period; set times from start only vs start+end span.
    - [ ] If `endPeriodId` set, run **contiguous span** validation; compute **startTime/endTime** from periods; persist `periodId`, `endPeriodId`, times.
  - [ ] If **no** active periods: keep current path (manual times, `periodId`/`endPeriodId` null).
- [ ] **`updateLessonTime`:** decide behavior (snap to periods / block / clear span). Implement consistently with periods-only.

### 6. Schedule page data (`getScheduleInitialData` / `admin/schedule/page.tsx`)

- [ ] Pass **`periods`** (already there); ensure **ordered** by `order`, `name`.
- [ ] Optionally pass flag **`periodsOnly: boolean`** (`activePeriodCount > 0`) to form to drive UI.

### 7. `FormContainer` / lesson case

- [ ] Pass `periodsOnly` and `endPeriodId` default from `data?.endPeriodId`.

### 8. `LessonForm.tsx` (main UI work)

- [ ] When **`periodsOnly`** (or `periods.length > 0` per product — prefer explicit flag from server):
  - [ ] **Hide** datetime inputs for `startTime` / `endTime`.
  - [ ] Show **Start period** dropdown (required).
  - [ ] Show **End period** dropdown: default **same as start** (single block) or “Same as start” option; for double block, user picks **later** period with **order ≥ start**.
  - [ ] On change: derive display of **time range** as read-only text (e.g. “08:00–09:30”) from selected periods + current anchor (reuse `mergePeriodTimesOntoAnchor` / `formatDateTimeToTimeString`).
  - [ ] Submit: send `periodId`, `endPeriodId` (or only `periodId` when single).
- [ ] When **not** periods-only: keep existing time inputs + optional single period dropdown as today (or simplify to times only).

### 9. Calendar / any consumer of lesson times

- [ ] Search for **`startTime`/`endTime`** editors besides `LessonForm` and align (e.g. `BigCalendar`, `updateLessonTime`).

### 10. Term generation (`termLessonGenerationRules.ts` or generator)

- [ ] Confirm it only uses **`Lesson.startTime` / `endTime`** on templates — no change if those are **always** filled from span. If anything assumes **one period**, update comments or logic.

### 11. Seed (`prisma/seed.ts`)

- [ ] Optionally set **`endPeriodId`** on a few demo lessons for multi-block example (or leave all single-period).

### 12. Tests

- [ ] Unit: `bellPeriodRules` — contiguous span, reject gaps, reject different schools, reject archived.
- [ ] Integration: `createLesson` with `periodId` + `endPeriodId` when periods exist; reject when periods-only and `periodId` missing.
- [ ] Optional: snapshot of computed times.

### 13. Documentation

- [ ] Update **`./BELL_SCHEDULE_IMPLEMENTATION.md`**: new subsection “Multi-period lessons (`endPeriodId`)” + “Periods-only UI when active periods exist.”
- [ ] Short note in **`README`** or task board if you track scheduling work there.

---

## API / JSON shape (for reference)

- **Create/Update lesson body** (conceptually):
  - `periodId`: string (required when school has active periods).
  - `endPeriodId`: string | null (optional; if null, single period; if set, must be ≥ start by `order` and contiguous).

---

## Risks / edge cases

| Risk | Mitigation |
|------|------------|
| Editing middle `Period` times breaks linked lessons | Same as today: snapshot times on lesson; document “re-sync from periods” optional future feature. |
| `order` gaps in school data | Validation rejects span; admin fixes period `order`. |
| Mixed schools (some lessons old without periods) | Periods-only applies only when **creating/editing** under a school with active periods; legacy rows unchanged until edited. |

---

## Suggested order of work

1. Migration + Prisma client (`endPeriodId`).
2. Domain validation + time computation from span.
3. `createLesson` / `updateLesson` paths.
4. `lessonSchema` + `LessonForm` + `periodsOnly` flag.
5. `updateLessonTime` / calendar policy.
6. Tests + docs + seed tweak.

---

## Files likely touched (quick list)

- `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`
- `src/lib/domain/bellPeriodRules.ts`
- `src/lib/formValidationSchemas.ts`
- `src/lib/actions.ts` (`createLesson`, `updateLesson`, `updateLessonTime`)
- `src/components/forms/LessonForm.tsx`
- `src/components/FormContainer.tsx`
- `src/app/(dashboard)/schools/[schoolId]/admin/schedule/page.tsx` (or wherever `getScheduleInitialData` lives)
- `./BELL_SCHEDULE_IMPLEMENTATION.md`
- `prisma/seed.ts` (optional)

---

*This file is the canonical guide for multi-period lessons and periods-only UI in this repo.*
