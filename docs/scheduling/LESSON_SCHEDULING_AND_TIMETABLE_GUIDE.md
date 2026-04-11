# Lesson Scheduling & Timetable Guide

This document is the **authoritative step-by-step guide** for how weekly lesson templates, term-scoped lesson sessions, generation, and future auto-timetabling concepts fit together in Skooly. Use it for product decisions, onboarding, and implementation planning.

---

## 1. Purpose

- Explain **why** there are two layers: `Lesson` (weekly template) vs `LessonSession` (dated instance).
- Describe **how** term generation works and what “generator” means in practice.
- Clarify **academic year vs term** linkage in the data model.
- Outline a **roadmap** for optional “auto-draft weekly timetable” without replacing manual control.

Related docs:

- [`CALENDAR_UI_UX_REDESIGN_PERIOD_GRID_GUIDE.md`](../calendar/CALENDAR_UI_UX_REDESIGN_PERIOD_GRID_GUIDE.md)
- [`CALENDAR_EXCEPTIONS_FULL_IMPLEMENTATION_GUIDE.md`](../calendar/CALENDAR_EXCEPTIONS_FULL_IMPLEMENTATION_GUIDE.md)

---

## 2. Core concepts (mental model)

### 2.1 Weekly lesson template (`Lesson`)

- Represents **intent**: “this class has this subject with this teacher on this weekday, in these bell periods, at this time-of-day.”
- Stored once per **school + class + day + time pattern** (plus subject, teacher, room, optional period span).
- **Not** tied directly to `Term` or `AcademicYear` in the schema; year is **indirect** via `Class.academicYearId`.

### 2.2 Dated lesson instance (`LessonSession`)

- Represents **reality on a specific calendar date** within a **term**.
- Has `termId`, `sessionDate`, and links to `templateLessonId` → `Lesson`.
- Used by the **calendar API**, attendance, and instance-level overrides (substitute, room override, cancel).

### 2.3 Why both exist

| Concern | Weekly template | Dated session |
|--------|------------------|---------------|
| “Every Monday Math block 3” | Yes | Derived |
| “Cancel only Jan 12” | No | Yes (per date) |
| “Substitute teacher one day” | No | Yes |
| Term/holiday boundaries | Via generation rules | Stored per row |
| Calendar range queries | Awkward | Natural |

**Rule of thumb:** `Lesson` = blueprint; `LessonSession` = materialized schedule for a term.

---

## 3. How academic year and term connect

### 3.1 Academic year

- `Class` has `academicYearId`.
- A lesson belongs to a `class`, so the template is **scoped to the class’s academic year** indirectly.

### 3.2 Term

- `LessonSession` has **required** `termId`.
- Term generation runs **for a chosen term** and only creates sessions whose `sessionDate` falls inside that term’s range (see engine in `src/lib/domain/termLessonGenerationRules.ts`).

So: **templates are year-ish via class; instances are explicitly term-scoped.**

---

## 4. What “the generator” is (and what to call it in the UI)

Technically, **generator** means: the code path that **expands** weekly `Lesson` rows into `LessonSession` rows for a given `termId`, applying rules (exceptions, duplicates, exam conflicts).

**Product-friendly labels** (recommended for admins):

- “Generate lesson sessions for this term”
- “Build term schedule from weekly templates”
- “Sync sessions for active term”

Avoid jargon like “run generator” in user-facing copy unless your audience is technical.

---

## 5. Term lesson generation — step by step

Implementation lives in `generateTermLessons` (`src/lib/domain/termLessonGenerationRules.ts`). API entry: `POST` to generate-term-schedule (see app route under `src/app/api/schools/[schoolId]/generate-term-schedule/`).

### Step 1 — Load school and term

- Resolve `schoolId`, `termId`, and school **timezone** (for local-day iteration).

### Step 2 — Load weekly templates

- `prisma.lesson.findMany({ where: { schoolId } })`
- Filter by **scope**: whole school, one grade, or one class.

### Step 3 — Load calendar exceptions for the term

- Holidays, breaks, exam periods that apply to `termId`.
- Used to **skip entire days** for all templates on those dates.

### Step 4 — Load existing sessions (idempotency)

- Find existing `LessonSession` rows for `(termId, templateLessonId, sessionDate)` to avoid duplicates (`ALREADY_EXISTS` skip reason).

### Step 5 — Load exams overlapping the term window

- Used to detect **exam conflicts** with proposed lesson slots (teacher/room overlap rules).

### Step 6 — Iterate each local day in the term

For each day:

1. Map calendar day → weekday enum (`MONDAY` …).
2. Pick templates scheduled on that weekday.
3. If the day falls under an exception range → skip all templates for that day (count by reason: `HOLIDAY`, `BREAK`, `EXAM_PERIOD`).
4. If a session already exists for `(template, date)` → skip (`ALREADY_EXISTS`).
5. Build slot start/end from template time-of-day in local timezone.
6. If overlapping exams conflict → skip and record conflict detail (`EXAM_CONFLICT` / `EXAM_CONFLICT_UNKNOWN`).

### Step 7 — Dry run vs commit

- **dryRun**: compute counts and conflicts, **no writes**.
- **commit**: `lessonSession.createMany` in batches with `skipDuplicates: true`, inside a transaction.

### Step 8 — Output

- Summary: candidates, created count, conflicted count, skips by reason.
- Optional conflict list for diagnostics.

---

## 6. After templates or sessions change

### New or updated weekly `Lesson`

- Sessions **do not** appear on the calendar until they exist as `LessonSession` rows for the visible range.
- Operational pattern: run **term generation** (or a targeted sync) after bulk template changes, or rely on automated hooks if you add them later.

### Instance-only changes

- Drag/reschedule **session** updates `LessonSession` (template unchanged) where that flow is implemented.

---

## 7. Calendar data path (why the list and calendar can differ)

- **Lesson list** often reads **templates** (`Lesson`).
- **Period grid / instance calendar** reads **`LessonSession`** (and exams/overlays) from `/api/schools/[schoolId]/calendar/instances` (`src/lib/domain/calendarInstances.ts`).

If templates exist but sessions were never generated for the active term, the list can show lessons while the calendar looks empty until generation runs.

---

## 8. Assisted weekly timetable (timetable assistant)

This is **not** the same problem as term expansion.

| Feature | What it solves |
|--------|----------------|
| Term generation (current) | Template → dated sessions for one term |
| Timetable assistant (MVP) | Per-class inputs (subject, teacher, periods/week, optional room) → **weekly** `Lesson` rows (preview, then commit) |

### 8.1 Why it’s harder

Full school timetabling is a **constraint satisfaction / optimization** problem:

- Hard: no double-booked teacher, no double-booked class, room capacity, required periods.
- Soft: minimize gaps, preferences, balance load.

There is no single “drop-in famous algorithm”; production systems use solvers (MIP/CP-SAT), heuristics, or hybrid human-in-the-loop.

### 8.2 Recommended product approach (hybrid)

1. **Keep manual weekly templates** as the default source of truth.
2. Add an optional **“Draft weekly timetable”** wizard that:
   - collects inputs (subjects per class, hours, teacher assignments, room rules),
   - produces **draft** `Lesson` rows or a preview grid,
   - runs **conflict checks** before commit,
   - lets admins accept/reject by class or by row.
3. After approval, run **term generation** to materialize `LessonSession` rows.

### 8.3 Naming

- Call it **timetable draft**, **auto-build weekly schedule**, or **assisted scheduling** — not “the generator,” to avoid confusion with term session generation.

### 8.4 MVP scope (implemented)

| Decision | Choice shipped |
|----------|----------------|
| Persistence | **Stateless preview**; **commit** writes real `Lesson` rows (optional **replace** existing templates for that class). |
| Inputs | **One class at a time**; rows: `subjectId`, `teacherId`, `periodsPerWeek`, optional **`blockSize`** (consecutive periods per block), optional `roomId`. |
| Solver | **Greedy** placement Mon–Fri × bell periods (including multi-period **contiguous** blocks); hard conflicts (teacher / class / room overlap) plus **teacher unavailability** windows (parity with commit — [`timetableTeacherAvailability.ts`](../../src/lib/domain/timetableTeacherAvailability.ts)). |
| Admin UI optimizer (F.4) | With `TIMETABLE_SOLVER_ENABLED=1`, timetable assistant pages offer **Preview (CP-SAT)** next to greedy; tabs compare grids; commit uses the active tab. See [TIMETABLE_ASSISTANT_MVP.md](../timetable/TIMETABLE_ASSISTANT_MVP.md) and [TIMETABLE_SOLVER_F4_IMPLEMENTATION.md](../timetable/TIMETABLE_SOLVER_F4_IMPLEMENTATION.md). |

**Status:** Production UI at `/schools/{schoolId}/admin/timetable-assistant` and APIs under `/api/schools/{schoolId}/timetable-assistant/`. See [TIMETABLE_ASSISTANT_MVP.md](../timetable/TIMETABLE_ASSISTANT_MVP.md). Term expansion (`generateTermLessons`) still materializes `LessonSession` rows after templates exist—run **Generate lesson sessions for this term** from Admin schedule when needed.

**Optional CP-SAT preview:** With `TIMETABLE_SOLVER_ENABLED=1` and the Python service running, `preview-optimize` / `preview-optimize-school` run **CP-SAT with soft goals** (SG1–SG4, default weights in code — Phase F.3). Set `TIMETABLE_SOLVER_FEASIBILITY_ONLY=1` to force feasibility-only. Draft persistence beyond stateless preview is still optional.

**Whole-school / multi-class draft (v1):** Global greedy placement across many classes in one preview; scope `school` / `grade` / `classIds`; flat requirement rows with `classId` and optional **`blockSize`**; `replaceScope` for commit. UI: `/schools/{schoolId}/admin/timetable-assistant/school`. APIs: `preview-school`, `commit-school`. Full detail: [TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md](../timetable/TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md).

**Multi-period blocks:** Each requirement can set `blockSize > 1` so one `Lesson` template spans consecutive bell periods (`periodId` + `endPeriodId`). See [TIMETABLE_ASSISTANT_MVP.md](../timetable/TIMETABLE_ASSISTANT_MVP.md) and Phase E in [TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md](../timetable/TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md).

**Phase F:** **F.1**–**F.4** shipped (including admin UI for CP-SAT preview) — [TIMETABLE_SOLVER_PHASE_F_DESIGN.md](../timetable/TIMETABLE_SOLVER_PHASE_F_DESIGN.md).

---

## 9. Checklist for implementers

- [x] Distinguish **template** (`Lesson`) vs **instance** (`LessonSession`) in UI copy.
- [x] After template CRUD, document whether ops must **regenerate** sessions for the term.
- [x] Expose **dry run** before **commit** for risky scopes (school-wide).
- [x] Surface generation results in **scheduling diagnostics** when available.
- [x] If adding auto-timetabling later, treat it as a **separate** feature from term expansion (see §8.4).

### 9.1 Implementation status (where this is enforced in the app)

| Checklist item | Where it lives |
|----------------|----------------|
| Template vs instance copy | [`AdminScheduleClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/schedule/AdminScheduleClient.tsx) — term generation panel; [`list/lessons/page.tsx`](../../src/app/(dashboard)/schools/[schoolId]/list/lessons/page.tsx) — page title and intro |
| Regenerate hint after template save | [`LessonForm.tsx`](../../src/components/forms/LessonForm.tsx) — admin success toast with link to Admin schedule; [`FormModal.tsx`](../../src/components/FormModal.tsx) passes `authUser` into `LessonForm` |
| Dry run before commit (school-wide) | [`AdminScheduleClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/schedule/AdminScheduleClient.tsx) — school-wide reminder + `Dry Run` / `Commit` gating |
| Diagnostics + audit | [`AdminScheduleClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/schedule/AdminScheduleClient.tsx) — links to scheduling diagnostics; [`SchedulingDiagnosticsClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/SchedulingDiagnosticsClient.tsx) — intro copy + link back to Admin schedule |
| Timetable assistant (§8) | [`TimetableAssistantClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/timetable-assistant/TimetableAssistantClient.tsx); APIs `timetable-assistant/preview` & `commit`; separate from term generation |

---

## 10. Key file references

| Area | Location |
|------|----------|
| Prisma: `Lesson`, `LessonSession`, `Class`, `Term` | `prisma/schema.prisma` |
| Term expansion engine | `src/lib/domain/termLessonGenerationRules.ts` |
| Calendar instances API | `src/lib/domain/calendarInstances.ts` |
| Generate term schedule API | `src/app/api/schools/[schoolId]/generate-term-schedule/` |
| Admin UI (dry run / commit) | `src/app/(dashboard)/schools/[schoolId]/admin/schedule/AdminScheduleClient.tsx` |
| Scheduling diagnostics UI | `src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/SchedulingDiagnosticsClient.tsx` |
| Weekly templates list | `src/app/(dashboard)/schools/[schoolId]/list/lessons/page.tsx` |
| Timetable assistant (MVP) | `src/lib/domain/timetableAssistant.ts`, `src/lib/timetableAssistantService.ts`, `src/app/(dashboard)/schools/[schoolId]/admin/timetable-assistant/` |
| Whole-school draft (planning) | [TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md](../timetable/TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md) |

---

## Document history

- **Created:** guide for lesson scheduling concepts, term generation, and future timetable drafting.
- **Updated:** §9 checklist implemented in UI; §9.1 implementation map; §8.4 timetable assistant MVP; link to [TIMETABLE_ASSISTANT_MVP.md](../timetable/TIMETABLE_ASSISTANT_MVP.md).
- **Updated:** §8 whole-school draft plan linked ([TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md](../timetable/TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md)).
