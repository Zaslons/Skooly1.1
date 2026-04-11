# Scheduling & Assessment Task Board

Execution board for the unified scheduling architecture.  
Use this as the day-to-day implementation tracker by epic, story, and checklist.

---

## How to Use This Board

- Work top-to-bottom by dependency.
- Do not start an unchecked story if its dependency story is not complete.
- Mark tasks with `[x]` only after code, tests, and validation are done.
- Keep API contracts and UI states in sync in the same sprint.

---

## Dependency Chain

1. `E0` Academic Year + Term Integrity (must ship first)
2. `E1` Data Foundation
3. `E2` Admin Setup Locking
4. `E3` Recurring DS Exams
5. `E4` Term Lesson Generation
6. `E5` Calendar Rendering + Instance Overrides
7. `E6` Micro-Assessments + Due Lesson Assignment
8. `E7` Hardening + Rollout

---

## E0 - Academic Year + Term Integrity (First Step)

### Goal
Establish a consistent, school-safe temporal backbone so all later scheduling flows (exceptions, generated lessons, exams, attendance, assignments) stay coherent.

### Scope Included (Term section in full)
- `AcademicYear` lifecycle and activation consistency with `School.activeAcademicYearId`.
- `Term` lifecycle, activation policy, and strict containment inside academic-year boundaries.
- `SchoolCalendarException` relation to `Term` for holidays/breaks/exam blocks.
- Readiness for operational children:
  - `Lesson` + generated `LessonSession` rows tied to term context.
  - `ExamTemplate` + generated `Exam` rows tied to term context.
  - downstream consumers (`Assignment`, `Attendance`, calendar feeds) reading term-scoped truth.

### Code Areas
- `prisma/schema.prisma`
- `src/lib/domain/temporalRules.ts` (shared rules + calendar exception bounds)
- `src/lib/schedulingErrorContract.ts` (conventions + `schedulingActionFailure` for actions)
- `src/lib/actions/academicYearActions.ts`
- `src/lib/actions/termActions.ts`
- `src/lib/actions.ts` (or extracted term actions module)
- `src/app/api/schools/[schoolId]/academic-years/route.ts`
- `src/app/api/schools/[schoolId]/academic-years/[academicYearId]/route.ts`
- Term routes: `src/app/api/schools/[schoolId]/academic-years/[academicYearId]/terms/**/route.ts`
- `src/app/api/schools/[schoolId]/terms/[termId]/calendar-exceptions/route.ts` (POST/GET term-scoped exceptions)

### Stories

#### E0-S1: Centralize domain rules (anti-inconsistency baseline)
- [x] Create shared domain validation helpers used by both routes and server actions.
- [x] Standardize error contract (`code`, `message`, `fieldErrors?`) for year/term operations — see `schedulingErrorContract.ts`; REST routes use `code`/`error`; actions adopt `code` incrementally (e.g. `createAcademicYearAction` validation/forbidden paths).
- [x] Enforce school scoping in every term/year read and mutation.

#### E0-S2: Academic year invariants
- [x] Enforce `startDate < endDate`.
- [x] Enforce no overlap across non-archived academic years per school.
- [x] Enforce single active academic year per school transactionally.
- [x] Keep `AcademicYear.isActive` and `School.activeAcademicYearId` synchronized.

#### E0-S3: Term CRUD and invariants
- [x] Add nested term endpoints/actions under academic year scope.
- [x] Enforce `Term.startDate < Term.endDate`.
- [x] Enforce term range fully contained in parent academic year.
- [x] Enforce no overlapping active terms within same academic year.
- [x] Prevent term creation/activation when parent academic year is archived.

#### E0-S4: Locking dependencies for downstream flows
- [x] Block generation APIs/actions until active academic year + valid term exist.
- [x] Block calendar exception creation until a term exists — `POST /api/schools/[schoolId]/terms/[termId]/calendar-exceptions` (term in path + archived-term guard).
- [x] Add status checks consumed later by setup-locking UI (`E2`).

#### E0-S5: Admin UX for temporal setup
- [x] Add year -> terms management view with active/archived badges.
- [x] Add create/update/archive term flow with deterministic validation messages.
- [x] Add clear blocking messaging for unavailable next steps.

### Acceptance Criteria
- [x] Academic year and term activation updates are transaction-safe and deterministic.
- [x] No term can be created outside parent academic-year range.
- [x] Overlap rules are consistent across route and action entry points.
- [x] Admin can complete year + term setup end-to-end without DB manual fixes.
- [x] Generation-related flows remain locked until E0 is valid.

---

## E1 - Data Foundation (Schema + Validation + Actions)

### Goal
Prepare the data model to support template-to-instance generation and contextual assessments.

### Code Areas
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/lib/formValidationSchemas.ts`
- `src/lib/actions.ts`

### Stories

#### E1-S1: Add temporal/grid models and relations
- [x] Add/validate `Term`, bell `Period` (time blocks), `SchoolCalendarException` (holidays/breaks/exam periods), `Lesson` / `LessonSession` relations and indexes. _(Roadmap “TimeSlot” is represented by weekly `Lesson` + `Period` templates in Skooly.)_
- [x] Add/validate `Exam.lessonId`, `Exam.examPeriodId`, `Exam.durationMinutes`, `Exam.isRecurring`, `Exam.examCategory`, term/template links.
- [x] Replace generic assignment due date link with `Assignment.dueLessonId` (with legacy `dueDate` compatibility).
- [x] Add migration-safe indexes for lesson and exam conflict checks.

#### E1-S2: Backward compatibility + migration safeguards
- [x] Keep temporary compatibility path for legacy assignment due date fields if needed.
- [x] Add migration script/backfill logic for existing assignment records — see [`docs/scheduling/SCHEDULING_DATA_BACKFILL.md`](docs/scheduling/SCHEDULING_DATA_BACKFILL.md) (optional SQL; run only if product rule fits).
- [x] Ensure old screens do not break during transition.

#### E1-S3: Validation and server actions alignment
- [x] Update Zod schemas for new exam and assignment constraints.
- [x] Update `createExam` / `updateExam` payload validation.
- [x] Update `createAssignment` / `updateAssignment` to enforce `dueLessonId`.
- [x] Add invariant checks for school and class-subject consistency.

### Acceptance Criteria
- [x] Prisma migration applies cleanly on staging data.
- [x] All create/update paths compile and run with new fields.
- [x] No runtime relation errors in existing pages.

---

## E2 - Admin Setup State Locking

### Goal
Force correct setup order before generation actions.

### Code Areas
- New page/section under `src/app/(dashboard)/schools/[schoolId]/admin/schedule/`
- `src/app/(dashboard)/schools/[schoolId]/admin/schedule/page.tsx`
- `src/app/(dashboard)/schools/[schoolId]/admin/schedule/AdminScheduleClient.tsx`
- New API endpoint(s) under `src/app/api/schools/[schoolId]/...`

### Stories

#### E2-S1: Setup status backend contract
- [x] Add `GET /api/schools/[schoolId]/setup/scheduling-status`.
- [x] Return step-by-step completion booleans + blocker messages.
- [x] Add server guards to reject protected operations if prerequisites fail.

#### E2-S2: Setup UX stepper
- [x] Build setup stepper UI with lock/unlock states.
- [x] Add links to fix missing prerequisites.
- [x] Add pre-generation readiness summary panel.

#### E2-S3: State synchronization and resiliency
- [x] Refresh step states after every setup mutation.
- [x] Display deterministic error messages from server guards.
- [x] Add empty/loading/error states for setup dashboard.

### Acceptance Criteria
- [x] Users cannot trigger generation before all required steps are complete.
- [x] UI lock state always matches backend guard logic.

---

## E3 - Recurring DS Exam Builder

### Goal
Enable weekly rotating exam loops and bulk pre-scheduling.

### Code Areas
- `src/components/forms/ExamForm.tsx`
- New DS builder component (suggested: `src/components/scheduling/RecurringExamBuilder.tsx`)
- `src/lib/actions.ts` (or new domain service module)
- New exam APIs under `src/app/api/schools/[schoolId]/...`

### Stories

#### E3-S1: DS payload model and preview
- [x] Define recurring loop payload shape (week index, day, start, duration, class/subject/room).
- [x] Add preview endpoint/action to expand loops to concrete dates.
- [x] Return grouped preview with conflict and skip reasons.

#### E3-S2: Commit bulk creation
- [x] Add commit endpoint/action for bulk exam insert (`createMany` chunked).
- [x] Support strict mode (fail all on first conflict).
- [x] Support lenient mode (skip conflicts, commit valid rows).

#### E3-S3: DS builder UI
- [x] Build visual loop editor with week-by-week rows.
- [x] Add preview table and conflict badges.
- [x] Add summary panel (created/skipped/conflicted counts).

### Acceptance Criteria
- [x] Preview and commit counts are deterministic and auditable.
- [x] Recurring DS exams are visually and semantically distinguishable from normal exams.

---

## E4 - Term Lesson Generation Engine

### Goal
Generate lessons from timetable templates while respecting blockers and conflicts.

### Code Areas
- New endpoint (suggested): `src/app/api/schools/[schoolId]/generate-term-schedule/route.ts`
- `src/lib/actions.ts` or extracted schedule generation service
- `src/app/(dashboard)/schools/[schoolId]/admin/schedule/AdminScheduleClient.tsx`

### Stories

#### E4-S1: Generation algorithm implementation
- [x] Iterate term dates by school timezone.
- [x] Skip holidays.
- [x] Skip exam periods.
- [x] Skip conflicting pre-scheduled exams by room/teacher/time.
- [x] Create lessons for valid slots only.

#### E4-S2: Dry run + write mode
- [x] Implement dry-run mode with full summary and no writes.
- [x] Implement commit mode with transaction safety.
- [x] Return per-reason skip counters and conflict details.

#### E4-S3: Idempotency and rollback
- [x] Add idempotency key handling to prevent duplicate generation — **commit** replays a prior successful run (same `idempotencyKey` + scope) without re-writing; audit log stores `conflicts` (capped) for replay.
- [x] Enforce deterministic uniqueness constraints for reruns (`LessonSession` unique + `createMany` `skipDuplicates`).
- [x] Validate rollback behavior on forced conflict failure (`simulateFailureAtOccurrenceIndex` + simulated transaction rollback).

### Acceptance Criteria
- [x] Dry-run and commit summaries are consistent.
- [x] No duplicate lessons after repeated requests.

---

## E5 - Unified Calendar + Instance Overrides

### Goal
Render generated instances (lessons + exams + overlays) and allow safe per-instance edits.

### Code Areas
- `src/components/BigCalendarContainer.tsx`
- `src/components/BigCalender.tsx`
- `src/app/(dashboard)/schools/[schoolId]/admin/schedule/AdminScheduleClient.tsx`
- `src/components/FormContainer.tsx`
- `src/components/forms/LessonForm.tsx`

### Stories

#### E5-S1: Data aggregation contract for calendar
- [x] Fetch lessons including `exams` and `assignmentsDue`.
- [x] Fetch standalone exams not attached to lessons.
- [x] Fetch holiday/exam period overlays.
- [x] Normalize all into one calendar event DTO.

#### E5-S2: Visual rendering rules
- [x] Render lessons in blue.
- [x] Render exams in red/yellow with duration-based spans.
- [x] Gray overlay for holidays and exam periods.
- [x] Add legend and filter chips (lesson/exam/blocked days).

#### E5-S3: Instance-only editing
- [x] On click, open edit modal for that exact instance.
- [x] Support room change, substitute teacher, cancellation, notes.
- [x] Ensure updates do not mutate source template recurrence.

### Acceptance Criteria
- [x] Calendar reflects merged schedule truth.
- [x] Editing one event never mutates sibling generated events.

---

## E6 - Micro-Assessments + Due-Lesson Assignments

### Goal
Attach quizzes and assignment deadlines directly to lesson context.

### Code Areas
- `src/components/forms/ExamForm.tsx`
- `src/components/forms/AssignmentForm.tsx`
- `src/components/FormContainer.tsx`
- `src/lib/actions.ts`
- Student/teacher list pages:
  - `src/app/(dashboard)/schools/[schoolId]/list/assignments/page.tsx`
  - `src/app/(dashboard)/schools/[schoolId]/list/exams/page.tsx`
  - `src/app/(dashboard)/schools/[schoolId]/list/results/page.tsx`

### Stories

#### E6-S1: Pop quiz linking
- [x] Update exam form to support lesson-linked quiz creation explicitly.
- [x] Show exam type and duration in form and listing tables.
- [x] Validate lesson ownership and school scope server-side.

#### E6-S2: Assignment due lesson UX
- [x] Replace generic due date with due lesson picker in assignment form.
- [x] Filter lesson options by class-subject and relevant date window.
- [x] Keep optional read-only display of computed due date/time from due lesson.

#### E6-S3: Badge injection in calendar cards
- [x] Add `Quiz: X mins` badge on lesson block when linked quiz exists.
- [x] Add `Assignment Due` badge when assignments are due on lesson.
- [x] Ensure badges are shown correctly for student and teacher views.

### Acceptance Criteria
- [x] Assignment and quiz context is visible directly on lesson instances.
- [x] List pages and result flows remain functional after data model changes.

---

## E7 - Hardening, Quality, and Rollout

### Goal
Make scheduling operations safe, observable, and production-ready.

### Code Areas
- `src/lib/actions.ts` and/or extracted scheduling services
- New/updated test files under project test directories
- Logging and monitoring hooks (project-specific)

### Stories

#### E7-S1: Test coverage
- [x] Add unit tests for conflict checks (`overlaps`) and date helpers (`assignmentDueDate` pure functions).
- [x] Add integration tests for scheduling API payloads (Zod: generate-term + recurring exams).
- [x] Add E2E smoke (`playwright`: `/join` loads). _Extend with full admin setup → generate → calendar when auth + seed fixtures are standardized._

#### E7-S2: Observability and audit
- [x] Log generation request id, duration, counts, and blockers.
- [x] Add auditable records for instance-level overrides.
- [x] Add admin-facing error diagnostics for failed generation runs.

#### E7-S3: Controlled rollout
- [x] Add feature flag by school for new scheduling flow.
- [ ] Pilot on one school/term, capture operational feedback.
- [x] Define rollback toggle and migration contingency notes.

### Acceptance Criteria
- [x] No silent failures in generation or DS commit flows.
- [x] Production rollout can be enabled/disabled per school safely.

---

## API Backlog (Concrete Endpoints to Add)

_Tracker below is synced with the codebase. Prefer marking `[x]` when the route exists and is wired for production use._

- [x] `GET /api/schools/[schoolId]/academic-years/[academicYearId]/terms`
- [x] `POST /api/schools/[schoolId]/academic-years/[academicYearId]/terms`
- [x] `GET /api/schools/[schoolId]/academic-years/[academicYearId]/terms/[termId]`
- [x] `PATCH /api/schools/[schoolId]/academic-years/[academicYearId]/terms/[termId]`
- [x] `DELETE /api/schools/[schoolId]/academic-years/[academicYearId]/terms/[termId]` (soft archive)
- [x] `GET /api/schools/[schoolId]/setup/scheduling-status`
- [x] `GET /api/schools/[schoolId]/admin/scheduling-diagnostics` (admin; recent audit rows + pipeline flag)
- [x] `GET` / `POST /api/schools/[schoolId]/terms/[termId]/calendar-exceptions` (term-scoped holidays/breaks/exam periods)
- [x] `GET` / `POST /api/schools/[schoolId]/periods` and `PATCH /api/schools/[schoolId]/periods/[periodId]` (bell schedule; admin mutations)
- [x] `POST /api/schools/[schoolId]/exams/recurring/preview`
- [x] `POST /api/schools/[schoolId]/exams/recurring/commit`
- [x] `POST /api/schools/[schoolId]/generate-term-schedule`
- [x] `GET /api/schools/[schoolId]/calendar/instances?start=...&end=...` (query: `teacherId`, `classId`; role-scoped)
- [x] **Instance overrides (E5):** `PATCH /api/schools/[schoolId]/lesson-sessions/[sessionId]` — updates `LessonSession` only (room override, substitute, cancel, notes, optional time shift). _Not_ `PATCH .../lessons/[lessonId]/...` (weekly templates stay immutable).

---

## Frontend Backlog (Concrete UI Pieces to Add)

- [x] Scheduling setup / readiness UI with blockers (`/schools/[schoolId]/admin/setup` + `SetupStatusClient`; uses `setup/scheduling-status`). _Not a literal multi-step wizard; shows lock states / next actions._
- [x] Scheduling diagnostics UI (`/schools/[schoolId]/admin/scheduling-diagnostics`; uses `admin/scheduling-diagnostics` API).
- [x] Bell schedule admin UI (`/schools/[schoolId]/admin/setup/bell-schedule`; CRUD via `/api/schools/[schoolId]/periods`).
- [x] Recurring DS exam flow (`/schools/[schoolId]/admin/setup/recurring-exams` + recurring preview/commit APIs).
- [x] Calendar legend + filter chips (lessons / exams / holidays & breaks) — admin schedule + teacher **My schedule**.
- [x] Lesson instance edit modal with override reason (`LessonSessionInstanceModal` + `PATCH lesson-sessions/[sessionId]`).
- [x] Badge chips inside calendar cards for quiz and assignment-due (`BigCalender` + `popQuizzes` / `assignmentDue` in `calendarInstances`).

---

## Suggested Sprint Mapping (8 Sprints)

- [ ] **Sprint 1:** E0-S1, E0-S2, E0-S3
- [ ] **Sprint 2:** E0-S4, E0-S5 + E1-S1
- [ ] **Sprint 3:** E1-S2, E1-S3 + E2-S1
- [ ] **Sprint 4:** E2-S2, E2-S3, E3-S1
- [ ] **Sprint 5:** E3-S2, E3-S3 + E4-S1
- [ ] **Sprint 6:** E4-S2, E4-S3, E5-S1
- [ ] **Sprint 7:** E5-S2, E5-S3, E6-S1
- [ ] **Sprint 8:** E6-S2, E6-S3, E7 hardening

---

## Related documentation

- **Bell schedule (`Period`) — full implementation plan:** [`docs/scheduling/BELL_SCHEDULE_IMPLEMENTATION.md`](docs/scheduling/BELL_SCHEDULE_IMPLEMENTATION.md) *(Phases 1–6 done: seed periods + `lesson.periodId` in demo data, docs/README links, optional skipped E2E; strict grid readiness in `getSchedulingSetupStatus` — lessons + active periods — and setup UI copy.)*

---

## Ready-for-Implementation Checklist

- [ ] Confirm E0 invariants and active-term policy as release gate.
- [ ] Confirm one shared domain rule layer for routes and server actions.
- [ ] Confirm final Prisma schema delta and naming.
- [ ] Confirm timezone handling policy per school.
- [ ] Confirm strict vs lenient DS conflict policy default.
- [ ] Confirm generation ownership permissions (admin roles).
- [ ] Confirm pilot school and term for rollout.

