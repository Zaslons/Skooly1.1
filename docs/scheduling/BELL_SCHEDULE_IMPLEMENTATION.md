# Bell schedule (`Period`) — implementation plan

This document describes **how to implement school bell periods end-to-end** so they work with Skooly’s existing scheduling stack (weekly `Lesson` templates, `LessonSession` generation, validation, admin schedule UI).

---

## 1. Purpose and scope

### What “bell” means here

- **`Period`** (Prisma): a **named time block** for a school (e.g. “Period 1”, “Lunch”) with `startTime`, `endTime`, `order`, optional `isArchived`.
- **`Lesson.periodId`**: optional link from a **weekly lesson template** to exactly one `Period`.

### What this is *not*

- **`SchoolCalendarException` with type `EXAM_PERIOD`**: calendar **date ranges** (exam weeks). Keep naming distinct in UX (“exam *window* on calendar” vs “bell *period*”).
- **Teacher availability** blocks: separate model; validation already mentions “unavailable” — do not overload `Period` for that.

### Goals

1. Admins can **define and reorder** bell periods per school.
2. Teachers/admins can **assign a lesson** to a bell period **or** keep free-form times (backward compatible).
3. Server validation **respects** either: (a) times match the chosen `Period`, or (b) times stay within allowed bounds derived from the school’s period set (or a safe default).
4. **Term generation** and calendar views keep working: they already use `Lesson.startTime` / `endTime`; once those stay consistent with `Period`, no engine rewrite is required.

---

## 2. Current state (baseline)

| Area | Today |
|------|--------|
| **Schema** | `Period` exists; `Lesson.periodId` optional FK. |
| **App usage** | No `prisma.period` usage; `periodId` never set from UI. |
| **Lesson create/update** | [`lessonSchema`](../../src/lib/formValidationSchemas.ts) has no `periodId`; [`LessonForm`](../../src/components/forms/LessonForm.tsx) uses raw `startTime` / `endTime` only. |
| **Validation** | Hard-coded **8:00–17:00** “school day” in [`src/lib/actions.ts`](../../src/lib/actions.ts) (`DEFAULT_WORK_*` constants) for lessons and exam templates. |

---

## 3. Design decisions (lock these before coding)

1. **Single source of truth for slot times**  
   - **Option A (recommended for v1):** Picking a `Period` **sets** `Lesson.startTime`/`endTime` from that period’s times (stored denormalized on `Lesson` for simple queries).  
   - **Option B:** Store only `periodId` and derive times at read time — more joins, easier drift if `Period` is edited later.

2. **Behavior when `Period` is edited after lessons reference it**  
   - **Policy:** Either block archive/delete if referenced, or **snapshot** times on lesson (no FK update) — document clearly.

3. **Schools with no periods defined**  
   - Keep **fallback** to current 8–17 (or configurable `School` fields later) so empty period list does not break the app.

4. **Overlap between periods**  
   - Decide: **non-overlapping** bell periods only (validate on create/update), or allow overlap (e.g. different tracks). **v1:** enforce non-overlap per school for simplicity.

---

## 4. Implementation phases (step by step)

### Phase 1 — Domain helpers + API (no UI yet) ✅ **Implemented**

**Goal:** CRUD for `Period` with school scope and basic validation.

1. Add **Zod schemas** in [`src/lib/formValidationSchemas.ts`](../../src/lib/formValidationSchemas.ts):  
   `periodCreateSchema`, `periodUpdateSchema` (name, start/end, order; optional `isArchived`).
2. Add **pure helpers** in [`src/lib/domain/bellPeriodRules.ts`](../../src/lib/domain/bellPeriodRules.ts):  
   - `timeOfDayMsLocal`, `periodIntervalsOverlap`, `assertStartBeforeEnd`, `assertPeriodDoesNotOverlapOthers`, `assertPeriodWithinDefaultSchoolHours` (8–17 local, matches lesson defaults).  
   - `BellPeriodError` (`INVALID_RANGE` | `PERIOD_OVERLAP` | `OUTSIDE_DEFAULT_SCHOOL_HOURS`).
3. **REST routes** (admin-only for mutations, `requireSchoolAccess` + `role === admin`):  
   - `GET /api/schools/[schoolId]/periods` — list periods (`?includeArchived=true` to include archived); ordered by `order`, `name`.  
   - `POST /api/schools/[schoolId]/periods` — create.  
   - `PATCH /api/schools/[schoolId]/periods/[periodId]` — update / soft-archive (`isArchived: true`).  
   - **No** hard `DELETE` — soft-archive only (per plan).
4. **Tests:** [`tests/unit/bellPeriodRules.test.ts`](../../tests/unit/bellPeriodRules.test.ts), [`tests/integration/periodSchemas.test.ts`](../../tests/integration/periodSchemas.test.ts).

**Exit criteria:** Periods can be created and listed via API; DB constraints satisfied.

**Notes:** Active periods must not overlap; times must fall in default school hours unless the period is `isArchived: true` (seed or legacy). `order` defaults to `max(order)+1` when omitted on create.

---

### Phase 2 — Admin UI for bell schedule ✅ **Implemented**

**Goal:** School admin can manage periods without Postman.

1. Page: **`/schools/[schoolId]/admin/setup/bell-schedule`** — [`page.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/setup/bell-schedule/page.tsx) + [`BellScheduleClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/setup/bell-schedule/BellScheduleClient.tsx).
2. **Client:** table with order, name, start/end (local time labels), active/archived; inline **edit**; **Add period** form (`type="time"` → ISO via “today” anchor); **Archive** / **Restore** (PATCH); **Show archived** toggle; **Refresh**.
3. **Empty state + info** banners: default 8–17 hours, overlap rules, “lessons can still use free-form times…”
4. **Links:** [`SetupStatusClient`](../../src/app/(dashboard)/schools/[schoolId]/admin/setup/SetupStatusClient.tsx) (“Bell schedule”), [`Menu.tsx`](../../src/components/Menu.tsx) SCHEDULING → **Bell schedule** (`ClockIcon`).

**Exit criteria:** Full lifecycle from UI; no raw SQL required for normal use.

**Deferred to v2:** drag-and-drop reorder (order is editable numerically in Edit).

---

### Phase 3 — Wire `Lesson` to `Period` (forms + actions) ✅ **Implemented**

**Goal:** Optional period selector; times stay consistent.

1. Extend **`lessonSchema`** with optional `periodId` (CUID; empty string stripped via `z.preprocess`).
2. **`getScheduleInitialData`** ([`admin/schedule/page.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/schedule/page.tsx)) and **`FormContainer`** case `lesson`: include **`periods`** for the school (**active only**, `order` then `name`).
3. **`LessonForm`:**  
   - Dropdown “Bell period (optional)”.  
   - On change: when a period is selected, **set** `startTime`/`endTime` from period via [`mergePeriodTimesOntoAnchor`](../../src/lib/domain/bellPeriodRules.ts) using the **current start time** as the calendar anchor (weekly templates still use an arbitrary date on `Lesson`; same pattern as before).  
   - When start/end times no longer match the selected period’s time-of-day, **`periodId` is cleared** (custom slot).
4. **`createLesson` / `updateLesson`** in [`actions.ts`](../../src/lib/actions.ts):  
   - If `periodId` provided: load active `Period`, verify `schoolId`, **overwrite** template times from the period (Option A / §3).  
   - Persist `periodId` on create/update.  
   - Validation via [`validateLessonTimesAgainstBellPolicy`](../../src/lib/domain/bellPeriodRules.ts):  
     - **No** active periods → legacy **8:00–17:00** window (same as before).  
     - **Has** active periods → lesson interval must lie **entirely inside one** active period (or pick a period in the form, which sets times from that period).  
5. **`updateLessonTime`** (calendar drag/resize): sets **`periodId: null`** so denormalized times are not left linked to a stale bell period. When the school has active periods, drag/resize is **disabled** (returns error).

**Exit criteria:** Creating/editing lessons with a period works; Prisma shows `periodId` on `Lesson`.

---

### Phase 3.1 — Multi-period lessons (`endPeriodId`) ✅ **Implemented**

- **`Lesson.endPeriodId`**: optional FK to `Period`; when set with `periodId`, the lesson spans consecutive periods (e.g. double block).
- **Single-period**: `endPeriodId === null`.
- **Validation**: `getContiguousPeriodRange` / `validateLessonPeriodSpan` ensure same school, not archived, no gaps in `order`.
- **Times**: `computeLessonTimesFromPeriodSpan` derives `startTime` from first period, `endTime` from last period.

---

### Phase 3.2 — Periods-only UI ✅ **Implemented**

- When the school has **at least one** active `Period`, the lesson form:
  - **Requires** a start period; **hides** free-form `startTime` / `endTime` inputs.
  - Shows **End period** dropdown (optional; "Same as start" = single block).
  - Displays read-only time range derived from selected period(s).

---

### Phase 4 — Generation, calendar, exams ✅ **Implemented**

**Goal:** No regressions; validation consistent with Phase 3.

1. **Term generation** ([`termLessonGenerationRules.ts`](../../src/lib/domain/termLessonGenerationRules.ts)): expands `Lesson` templates by `day` + `startTime`/`endTime` into `LessonSession` rows. **No duplicate bell validation** in this module — template times are enforced at **write time** (lessons / exam templates). File comment documents this.
2. **Exam templates** ([`createExamTemplate`](../../src/lib/actions.ts), [`updateExamTemplate`](../../src/lib/actions.ts)): use the same policy as lessons via [`validateLessonTimesAgainstBellPolicy`](../../src/lib/domain/bellPeriodRules.ts) with `slotKind: "examTemplate"` (active periods → slot must fit **one** period; no periods → 8:00–17:00 fallback). **`updateExamTemplate`** now matches **weekend** + bell rules (parity with create).
3. **Bulk import:** The admin bulk-import UI today imports **students, teachers, and results** only — **not** lessons. If lesson CSV import is added later, map **start/end times** or **period id/name** and validate with the same helpers as `createLesson` / `updateLesson`. See §5.1 below.

**Exit criteria:** Dry-run/commit generation unchanged for schools without periods; with periods, exam template validation matches lessons.

---

### Phase 5 — Scheduling setup integration ✅ **Implemented (strict)**

**Goal:** Make “grid” readiness explicit.

1. **Strict policy (chosen):** [`getSchedulingSetupStatus`](../../src/lib/domain/temporalRules.ts) treats **grid initialization** as complete only when **`lessonCount > 0`** and **`activePeriodCount > 0`** (active = `Period` with `isArchived: false`). Blockers list what is missing (lessons and/or bell periods). **Fix link** priority: if no lessons → admin schedule; if lessons exist but no periods → [`/admin/setup/bell-schedule`](../../src/app/(dashboard)/schools/[schoolId]/admin/setup/bell-schedule/page.tsx).

2. **[`SetupStatusClient`](../../src/app/(dashboard)/schools/[schoolId]/admin/setup/SetupStatusClient.tsx):** Stepper intro notes that grid requires **lessons + active bell periods**.

3. Pure helpers for tests: [`isGridInitializationComplete`](../../src/lib/domain/temporalRules.ts), [`buildGridInitializationBlockers`](../../src/lib/domain/temporalRules.ts).

**Exit criteria:** Curriculum mapping / downstream steps stay locked until both lessons and periods exist; admins see clear blockers and links.

---

### Phase 6 — Polish and rollout ✅ **Implemented**

1. **Seed** ([`prisma/seed.ts`](prisma/seed.ts)): the demo school (Springfield Academy) gets **eight** non-overlapping active periods (**08:00–09:00 … 15:00–16:00**, Sept 1 anchor, `order` 0–7). Seeded **lesson templates** set **`periodId`** to the period matching each slot’s hour (`8+s` → `Period s+1`), so strict grid readiness is satisfied after `prisma db seed`.  
2. **Docs:** README “Scheduling” links to this file and the task board; cross-links updated.  
3. **E2E:** optional Playwright spec [`tests/e2e/bell-schedule.spec.ts`](../../tests/e2e/bell-schedule.spec.ts) is **skipped by default** (requires auth); outlines a future admin flow.

---

## 5. Data migration

- **No migration** if `Period` + `Lesson.periodId` already exist in schema.  
- **Backfill:** existing lessons have `periodId = null`; they continue to work with fallback hours.  
- Optional: one-off script to assign `periodId` by matching `startTime`/`endTime` to a period.

### 5.1 Bulk import vs bell schedule

- **Current product:** [`admin/bulk-import`](../../src/app/(dashboard)/schools/[schoolId]/admin/bulk-import/page.tsx) does **not** import weekly lesson templates; no CSV columns for periods or lesson times today.
- **Future lesson import:** if implemented, server actions should resolve times (or `periodId`) and call **`validateLessonTimesAgainstBellPolicy`** — same rules as [`createLesson`](../../src/lib/actions.ts).

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Editing period times breaks mental model for old lessons | Snapshot times on lesson (Option A) + show “custom” vs “linked” in UI. |
| Timezone/DST confusion | Reuse school timezone from [`School.timezone`](prisma/schema.prisma) for any **date** that combines with period times; document same as lesson templates. |
| Duplicate `@@unique([schoolId, name])` | Clear validation message on create. |

---

## 7. Suggested order of tasks (checklist)

- [x] Phase 1: Zod + `bellPeriodRules` + REST CRUD + tests  
- [x] Phase 2: Admin UI + menu link  
- [x] Phase 3: `lessonSchema` + `LessonForm` + `createLesson`/`updateLesson` + validation fallback  
- [x] Phase 4: Exam template + import consistency  
- [x] Phase 5: Setup status (strict grid = lessons + active periods)  
- [x] Phase 6: Seed + docs + E2E (optional skipped spec)  

---

## 8. File touch list (reference)

| Area | Files likely touched |
|------|----------------------|
| API | `src/app/api/schools/[schoolId]/periods/route.ts`, `.../periods/[periodId]/route.ts` |
| Domain | `src/lib/domain/bellPeriodRules.ts` |
| Schemas | `src/lib/formValidationSchemas.ts` |
| Actions | `src/lib/actions.ts` (`createLesson`, `updateLesson`, exam template paths) |
| UI | **Phase 2:** `admin/setup/bell-schedule/page.tsx`, `BellScheduleClient.tsx`, `Menu.tsx`, `SetupStatusClient.tsx`. **Phase 3:** `LessonForm.tsx`, … |
| Schedule data | Where `getScheduleInitialData` / related data for lessons is loaded |

---

*Last updated: aligns with Skooly schema and `actions.ts` patterns as of the scheduling initiative.*
