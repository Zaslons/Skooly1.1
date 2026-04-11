# Skooly Scheduling & Assessment Implementation Roadmap

This roadmap translates the unified architecture blueprint into executable workstreams.  
Goal: deliver a reliable, conflict-aware scheduling and assessment platform in logical phases, with clear backend, frontend, data, and QA scopes.

---

## 0) Program Objectives and Delivery Principles

### Primary outcomes
- Generate term lessons automatically from template inputs (`ClassSubject` + weekly timetable + `TimeSlot`).
- Support one unified exam model for finals, recurring DS loops, and pop quizzes.
- Attach micro-assessments and assignment deadlines to concrete `Lesson` instances.
- Provide a calendar-first UX where generated instances are editable without breaking recurrence logic.

### Delivery principles
- **Template to Instance:** never rely on manual creation for recurring lessons at term scale.
- **State-based locking:** enforce setup order so generation cannot run on incomplete configuration.
- **Conflict-first safety:** prevent or rollback double-booking and invalid state transitions.
- **Auditability:** every generation and override action must be traceable.

### Definition of done (global)
- Migrations applied and schema validated.
- Core APIs tested (unit + integration).
- Admin flow complete end-to-end for one school and one term.
- Calendar displays lessons, exams, and due-assignment context correctly.
- Rollback/recovery path validated for generation failures.

---

## 1) Scope Boundaries and Assumptions

### In scope
- Term/time-grid scheduling engine.
- Recurring DS exam builder and bulk exam pre-scheduling.
- Lesson generation endpoint with skip logic (holidays, exam periods, conflicting exams).
- Unified calendar rendering and per-instance edit modal.
- Assignment due-by-lesson linkage and lesson badges.

### Out of scope (later phases)
- Full AI conflict optimizer.
- External meeting providers (Zoom/Meet) and automatic link generation.
- Full teacher availability hard constraints in initial release (planned later integration).

### Assumptions to confirm before coding
- Existing `AcademicYear`, `Class`, `Subject`, `Teacher`, `Room`, and `ClassSubject` are production-ready.
- Timezone strategy is defined globally per school (critical for date/time generation).
- Existing auth/role guards are sufficient for new routes.

---

## 2) Phase Plan (Execution Order)

1. **Academic Year + Term integrity (must ship first)**
2. **Foundation & schema hardening**
3. **Admin setup workflow with state-locking**
4. **Recurring DS exam builder + bulk creation**
5. **Master lesson generation engine**
6. **Unified calendar rendering + instance editing**
7. **Micro-assessment and assignment context integration**
8. **Reliability, observability, and rollout hardening**

Each phase has backend, frontend, QA, and release gates below.

---

## 2.1) Phase 0 - Academic Year + Term Integrity (First Step)

This phase is mandatory before any schedule generation, recurring exams, or calendar instance rendering.
When we say "Term section", it includes the full operational chain that depends on term boundaries.

### 2.1.1 Domain scope included in this phase
- `AcademicYear` lifecycle and activation (`School.activeAcademicYearId` consistency).
- `Term` lifecycle, activation, and date boundaries within `AcademicYear`.
- `SchoolCalendarException` relation to `Term` (holidays, breaks, exam-period blocks).
- Readiness relations for generated operations:
  - `Lesson` templates and `LessonSession` instances bound to a `Term`.
  - `ExamTemplate` and generated `Exam` bound to a `Term`.
  - downstream consumers (`Assignment`, `Attendance`, calendar feeds) reading term-scoped data.

### 2.1.2 Consistency architecture (to avoid drift with existing app patterns)
- Keep one business-rule source in shared domain services (used by both API routes and server actions).
- Do not duplicate validation logic separately in UI action handlers and route handlers.
- Enforce school scoping (`schoolId`) in every read/write path.
- Use transactions for activation changes and cross-table updates.
- Keep error contract stable across routes/actions (`code`, `message`, optional `fieldErrors`).

### 2.1.3 Core invariants to enforce now
- `AcademicYear.startDate < AcademicYear.endDate`.
- No overlapping non-archived academic years per school.
- Only one active academic year per school.
- `Term.startDate < Term.endDate`.
- Every term is fully contained within parent academic-year boundaries.
- No overlapping active terms within the same academic year.
- Archived academic years cannot receive new terms or new active term changes.

### 2.1.4 Backend/API implementation steps
- Implement/normalize nested term APIs under academic year scope:
  - `GET /api/schools/[schoolId]/academic-years/[academicYearId]/terms`
  - `POST /api/schools/[schoolId]/academic-years/[academicYearId]/terms`
  - `GET /api/schools/[schoolId]/academic-years/[academicYearId]/terms/[termId]`
  - `PATCH /api/schools/[schoolId]/academic-years/[academicYearId]/terms/[termId]`
  - `DELETE` (soft archive) for term.
- Add term activation endpoint/action (single active term policy).
- Add guard: generation endpoints must reject requests without a valid active academic year and valid target term.

### 2.1.5 UI/UX implementation steps
- Add an `Academic Year -> Terms` management view in admin.
- Show active/archived badges for year and term.
- Add clear blocking states:
  - generation disabled until at least one valid active term exists.
  - exceptions creation disabled until term exists.
- Surface deterministic validation feedback (boundary and overlap errors).

### 2.1.6 Logical flow alignment (school operations)
- Setup order in this phase:
  1. Create and validate academic year
  2. Set active academic year
  3. Create terms within that year
  4. Set active term
  5. Add term exceptions (holidays/break/exam period)
  6. Only then allow lesson/exam generation steps
- This preserves chronological correctness for attendance, assignments, and reporting later.

### 2.1.7 Acceptance criteria for Phase 0
- Academic year and term activation/deactivation are transaction-safe and deterministic.
- No term can exist outside the academic year date window.
- Overlap rules are enforced consistently across API and server actions.
- Admin can complete year+term setup end-to-end without manual DB intervention.
- Generation-related UI and APIs remain locked until this phase is valid.

---

## 3) Phase 1 - Foundation & Schema Hardening

### 3.1 Data model tasks (Prisma)
- Add or validate models: `Term`, `TimeSlot`, `ExamPeriod`, `Lesson`, updated `Exam`, updated `Assignment`.
- Ensure relations are explicit and include school scoping fields where required.
- Add constraints/indexes for high-frequency checks:
  - Lesson uniqueness by class/date/timeslot (or equivalent generation key).
  - Exam lookup indexes for `date`, `classSubjectId`, `roomId`, and teacher-linked conflict checks.
  - Assignment lookup by `dueLessonId`.
- Add enum(s) for exam semantics (recommended), e.g. `EXAM_TYPE` = `PERIOD`, `RECURRING_DS`, `LESSON_QUIZ`.

### 3.2 Migration and backfill strategy
- Create forward-only migration(s) for new fields/models.
- Backfill old `Assignment.dueDate` into `dueLessonId` using nearest valid lesson rule (temporary fallback if no exact match).
- Introduce temporary dual-read if needed for safe migration window.

### 3.3 Backend refactor tasks
- Update Prisma client types and repositories/services using old exam/assignment assumptions.
- Add centralized validators for:
  - term ranges,
  - exam duration > 0,
  - due lesson belongs to same class subject scope.

### 3.4 Frontend impact tasks
- Update forms using legacy exam/assignment fields.
- Add migration-safe labels and tooltips where behavior changes (e.g., assignment due now tied to a lesson).

### 3.5 QA and acceptance
- Migration runs on staging snapshot with zero data loss.
- CRUD works for `Term`, `TimeSlot`, `ExamPeriod`, `Lesson`, `Exam`, `Assignment`.
- Existing pages compile and load without runtime relation errors.

---

## 4) Phase 2 - Admin Setup Wizard + State-Based Locking

### 4.1 UX structure
- Build an Admin “Scheduling Setup” command center with explicit steps:
  1. Static Initialization
  2. Temporal Initialization
  3. Grid Initialization
  4. Curriculum Mapping
  5. DS Recurring Exams (optional)
  6. Generate Term
- Locked steps show unmet prerequisites and direct links to fix them.

### 4.2 Backend state model
- Introduce setup progress endpoint:
  - `GET /api/schools/[schoolId]/setup/scheduling-status`
- Return step booleans + blocking reasons.
- Enforce guards server-side on protected actions (do not trust UI lock only).

### 4.3 Frontend implementation
- Add stepper page with completion indicators and error details.
- Disable mutation actions until required prior states are true.
- Include “Readiness Checklist” before generation trigger.

### 4.4 QA and acceptance
- Attempting step `N` API before `N-1` returns deterministic validation error.
- UI lock state refreshes after each completed step.
- Admin can complete full setup without leaving unresolved blockers.

---

## 5) Phase 3 - Recurring DS Exam Builder

### 5.1 Functional behavior
- Admin defines recurring weekly rotation patterns for a term by grade/class scope.
- Builder outputs a normalized payload (JSON) that maps week index → one or many exam blocks.
- System expands the pattern across term dates and bulk creates `Exam` rows.

### 5.2 Backend APIs
- `POST /api/schools/[schoolId]/exams/recurring/preview`
  - Validate payload, expand to date instances, return conflicts.
- `POST /api/schools/[schoolId]/exams/recurring/commit`
  - Persist via `createMany` (chunked), return created count + skipped/conflicted count.

### 5.3 Conflict handling rules
- Detect teacher, room, class overlaps.
- Respect holidays and exam period boundaries.
- Provide “skip vs fail-all” mode:
  - **Strict mode:** any conflict aborts all.
  - **Lenient mode:** skip conflicted instances and report.

### 5.4 UI/UX tasks
- Build visual weekly loop editor:
  - day selector, start time, duration, subject, room.
- Preview table grouped by week/date.
- Inline conflict badges with quick-fix actions.

### 5.5 QA and acceptance
- Preview and commit counts match deterministic expectations.
- DS exams appear as recurring-generated exams with clear indicator (`isRecurring` or exam type).
- No silent partial writes in strict mode.

---

## 6) Phase 4 - Master Lesson Generation Engine

### 6.1 Endpoint and orchestration
- Implement `POST /api/schools/[schoolId]/generate-term-schedule`.
- Inputs:
  - `termId`
  - generation scope (school-wide, grade-level, class-level)
  - optional dry-run flag.

### 6.2 Generation algorithm requirements
- Iterate date range in term boundaries.
- Skip if holiday.
- Skip if in exam period.
- Skip if conflicting pre-scheduled exam exists for room/teacher/time-slot.
- Create lesson instance for each valid weekly timetable mapping.

### 6.3 Transaction and idempotency strategy
- Wrap chunked generation in `prisma.$transaction`.
- Add idempotency key per generation request to prevent duplicate runs.
- Use deterministic uniqueness keys to make reruns safe.

### 6.4 Error model and reporting
- Return summary:
  - generated count,
  - skipped by reason,
  - conflict details,
  - duration and request id.
- Persist generation logs for later audit and support.

### 6.5 QA and acceptance
- Dry run produces exact expected summary without writes.
- Commit run matches dry run except for race-condition conflicts.
- Rollback verified when forced conflict error is injected mid-run.

---

## 7) Phase 5 - Unified Master Calendar + Instance Editing

### 7.1 Rendering requirements
- `BigCalendarContainer` shows generated instances, not templates.
- Visual conventions:
  - lessons = blue,
  - exams = red/yellow,
  - holidays/exam-period days = gray mask/overlay.
- Exam blocks should visually reflect `durationMinutes` where supported by calendar granularity.

### 7.2 Data fetching shape
- Consolidated query endpoint for calendar range:
  - lessons with `include: { exams: true, assignmentsDue: true }`,
  - standalone exams not attached to lessons,
  - holiday/exam period overlays.

**Implemented (Skooly):** `GET /api/schools/[schoolId]/calendar/instances?start=&end=` returns a normalized `CalendarInstanceEventDTO[]` from `getCalendarInstancesForRange` (lesson `LessonSession` rows, exams, overlays, assignment-due hints). Role filters: `teacherId`, `classId` as applicable. This matches the intent above without a single Prisma `Lesson` query with nested `include`.

### 7.3 Instance-level edit modal
- Allow edits without modifying recurrence templates:
  - room change,
  - teacher substitute,
  - cancellation/status change,
  - note/reason.
- Store override metadata to keep audit trail.

**Implemented (Skooly):** `PATCH /api/schools/[schoolId]/lesson-sessions/[sessionId]` updates `LessonSession` fields only; weekly `Lesson` templates are not mutated. UI: `LessonSessionInstanceModal` on admin schedule. Teacher **My schedule** uses the same calendar feed (read-only) + existing schedule-change request flow for template-scoped requests.

### 7.4 QA and acceptance
- Calendar visual states match source data.
- Editing one instance does not mutate sibling recurring instances.
- Conflicting edit attempts surface immediate validation errors.

---

## 8) Phase 6 - Micro-Assessments and Assignment Due Integration

### 8.1 Lesson-context assessments
- Support pop quiz creation linked to a specific lesson (`lessonId` on `Exam`).
- Badge rendering on lesson cards:
  - `Quiz: X mins`
  - `Assignment Due`

**Implemented (Skooly):** `Exam.examCategory` (`COURSE_EXAM` | `POP_QUIZ`). Pop quizzes contribute `popQuizzes[]` on lesson session DTOs; `BigCalender` shows `Quiz: X mins`. Course exams remain separate calendar events.

### 8.2 Assignment workflow updates
- Assignment creation requires selecting a due lesson (not generic due date).
- For teacher UX, provide filtered due-lesson picker by class subject and date window.

**Implemented (Skooly):** `AssignmentForm` prioritizes due lesson + live preview via `previewAssignmentDueDateAction` / `computeDueDateForAssignment` (active term + weekly slot). Due lessons filtered to the same class as the source lesson. Server enforces `lesson.classId === dueLesson.classId` and sets `dueDate` from computation (optional legacy override if `dueDate` sent).

### 8.3 API updates
- `POST /assignments` validates `dueLessonId` scope consistency.
- Lesson detail endpoint returns due assignments and linked quizzes efficiently.

**Implemented (Skooly):** Scope checks in `createAssignment` / `updateAssignment` (same school, same class). Dedicated REST `POST /assignments` not added — existing server actions remain the contract.

### 8.4 QA and acceptance
- Student/teacher calendars show accurate contextual badges.
- Due assignment is traceable to a concrete lesson and classroom context.
- Report pages and list pages continue to function with new linkage model.

---

## 9) Phase 7 - Reliability, Security, and Rollout Hardening

### 9.1 Reliability
- Add background job option for large school generation.
- Add retries for transient DB errors (bounded, safe).
- Add metrics: generation duration, skip rates, conflict counts.

### 9.2 Security and permissions
- Restrict generation and DS commit to admin-authorized roles.
- Add server-side school ownership checks on all new endpoints.
- Log sensitive schedule mutations in audit table/event log.

### 9.3 Testing strategy
- Unit tests: validators, conflict engine, date iteration logic.
- Integration tests: endpoint workflows with seeded fixtures.
- E2E tests: admin setup wizard → generate → calendar verify.

### 9.4 Rollout plan
- Feature flag by school.
- Pilot with one school + one term.
- Monitor logs/metrics for one full cycle before broad enablement.

---

## 10) Cross-Cutting Backlog (Parallelizable)

### Backend
- Introduce reusable conflict-check service for lessons/exams/rooms/teachers.
- Add domain services for schedule generation and recurring exam expansion.
- Add event log model for operational debugging.

### Frontend
- Reusable conflict badge component and schedule status chips.
- Shared date-range and slot visualization components for builder + calendar.
- Empty/error/skeleton states for all scheduling pages.

### Data & operations
- Seed realistic sample term fixtures for local QA.
- Build admin diagnostics page to inspect blockers and conflicts quickly.

---

## 11) Suggested Sprint Breakdown (8 Sprints)

### Sprint 1
- Prisma schema updates + migration scaffolding.
- Basic CRUD/API hardening for term/grid/exam period.

### Sprint 2
- Setup status endpoint + state-locking UI shell.
- Readiness checklist and server-side guards.

### Sprint 3
- DS builder payload model + preview endpoint + conflict reporting.

### Sprint 4
- DS commit endpoint + UI commit flow + strict/lenient modes.

### Sprint 5
- Master generation endpoint with dry-run + commit + reporting.

### Sprint 6
- Calendar data aggregation + event rendering conventions.
- Instance edit modal (room/substitute/cancel).

### Sprint 7
- Lesson badges for quiz/assignment due.
- Assignment due-lesson UX and API enforcement.

### Sprint 8
- Test hardening, metrics, audit logs, feature flag rollout support.

---

## 12) Risks and Mitigations

- **Timezone/date drift risk:** enforce one canonical school timezone and normalize date calculations.
- **Conflict complexity growth:** centralize conflict engine early, avoid duplicated logic in routes.
- **Partial data writes:** use transactions + strict response summaries + idempotency keys.
- **UI confusion in locked flows:** show actionable blockers and direct navigation links.
- **Performance on large terms:** support chunked generation and optional background jobs.

---

## 13) Immediate Next Actions (Start Here)

1. Finalize Prisma schema delta and migration plan for `Lesson`, `Exam`, `Assignment`, `Term`, `TimeSlot`, `ExamPeriod`.
2. Implement scheduling setup status endpoint and wire state-locking in admin UI.
3. Build recurring DS preview API first (before commit) to de-risk conflict logic.
4. Implement generation endpoint with dry-run mode before enabling writes.
5. Integrate calendar rendering contract and verify lessons/exams/badges end-to-end.

---

## 14) Working Agreements for This Initiative

- No generation write operation ships without dry-run and summary reporting.
- No UI action considered complete without server guard parity.
- Any conflict rule change must include unit tests and documented examples.
- Keep scheduling and exam semantics explicit (avoid overloaded ambiguous fields).

