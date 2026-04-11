# Calendar Exceptions — Full Implementation Guide (HOLIDAY / BREAK / EXAM_PERIOD)

This guide is the canonical development plan for implementing calendar exceptions end-to-end in Skooly:

- Holidays
- Breaks
- Exam periods

It is based on the provided production spec, plus an audit of the current repo implementation to ensure we don’t miss anything.

---

## 1) Canonical Requirements (from spec)

### 1.1 Domain model and behavior

Skooly already models:

- `SchoolCalendarException` (term-scoped exceptions)
- `Exam.examPeriodId` (optional linkage to a term exception of type `EXAM_PERIOD`)

Required business rules:

1. Exception must belong to the same school as the term.
2. Exception must be fully inside term date range.
3. `startDate < endDate`.
4. Archived term cannot be edited.
5. Admin-only mutation.
6. List/read should be school-scoped (role-safe).
7. Exception edits/deletes must not break referential integrity for exams:
   - If deleting an `EXAM_PERIOD` in use, either:
     - reject with conflict, or
     - force unlink (explicit user choice, default reject).

### 1.2 API contract

Endpoints:

- `GET /api/schools/[schoolId]/terms/[termId]/calendar-exceptions`
- `POST /api/schools/[schoolId]/terms/[termId]/calendar-exceptions`
- `PATCH /api/schools/[schoolId]/terms/[termId]/calendar-exceptions/[exceptionId]`
- `DELETE /api/schools/[schoolId]/terms/[termId]/calendar-exceptions/[exceptionId]`

Response conventions:

- Standard success JSON
- Standard failure JSON: `{ code, error, fieldErrors? }`

Recommended error codes:

- `INVALID_INPUT`
- `FORBIDDEN`
- `TERM_NOT_FOUND`
- `TERM_ARCHIVED`
- `CALENDAR_EXCEPTION_NOT_FOUND`
- `CALENDAR_EXCEPTION_OUTSIDE_TERM`
- `CALENDAR_EXCEPTION_IN_USE`
- `SERVER_ERROR`

GET query options (should be added):

- optional `type` filter
- optional `from` / `to` to constrain listing within a visible calendar range

### 1.3 UI/UX requirements

Admin screen:

- Page: `/schools/[schoolId]/admin/calendar-exceptions`
- Sections:
  1. Header + term selector
  2. Exceptions table/list grouped by type and date
  3. Create/Edit form drawer/modal
  4. Empty state and helper text
  5. Actions: edit, delete

Form fields:

- Type: Holiday / Break / Exam Period
- Title
- Start date/time
- End date/time
- Notes (optional)

Validation UX:

- inline field errors
- deterministic server error display
- clear message when out of term bounds

Calendar integration UX:

- In admin schedule and teacher schedule:
  - overlays should be visible and legible
  - filter chip controls visibility of holidays/breaks/exam periods overlays
  - tooltip/label should show: exception title, type, date range

Exam form UX:

- For exam creation/edit:
  - `Exam Period` dropdown should show only `EXAM_PERIOD` exceptions within the current/selected term for the same school
  - option label should show date range for clarity

### 1.4 Integration with scheduling engines

Term generation must:

- skip days covered by `HOLIDAY`, `BREAK`, `EXAM_PERIOD`
- increment skip reason counters deterministically
- include skip detail in summary as needed

Recurring exam preview/commit must:

- detect and mark exception conflicts
- strict mode: fail all when conflicts exist
- lenient mode: skip conflicted rows
- return grouped conflict reasons

### 1.5 Safety, audit, diagnostics

Auditing mutations:

- exception create
- exception update
- exception delete

Audit row should include:

- `schoolId`
- `termId`
- `actorAuthId`
- `operation`
- before/after payload (or patch)
- `createdAt`

Diagnostics updates:

- extend scheduling diagnostics to include:
  - recent exception mutations
  - counts by type
  - latest conflicts caused by exceptions (if captured)

### 1.6 Testing strategy

Unit tests:

- in-term boundary checks
- date ordering
- type guards / mapping utilities

Integration tests (API):

- auth/role checks
- school/term scoping
- out-of-range rejection
- archived term rejection
- edit/delete behavior
- conflict when deleting in-use `EXAM_PERIOD`

E2E scenario:

1. Admin creates holiday in active term
2. Calendar shows overlay
3. Generation dry-run skip counts include holiday
4. Exam form lists exam periods for `EXAM_PERIOD` type

---

## 2) Current Repo Implementation Audit (what already exists)

### 2.1 Data model

Prisma has:

- `model SchoolCalendarException` with `type` enum values `HOLIDAY | BREAK | EXAM_PERIOD`
- `model Exam` with `examPeriodId` referencing `SchoolCalendarException` using:
  - `onDelete: SetNull`

Implication:

- deleting an exception will not break referential integrity, but it will silently unlink exams unless we add an application-level in-use guard.

### 2.2 Term generation (already skips exceptions)

File: [`src/lib/domain/termLessonGenerationRules.ts`](../../src/lib/domain/termLessonGenerationRules.ts)

What it does today:

- Loads `SchoolCalendarException` rows for the term where type is one of:
  - `HOLIDAY`, `BREAK`, `EXAM_PERIOD`
- For each local calendar day candidate:
  - checks if the day is inside an exception range
  - if yes, skips all lesson templates for that weekday
  - increments `skippedByReason` counters deterministically

Status:

- ✅ Implemented for skip behavior + deterministic counters
- Mostly already aligns with spec requirement #4.1

### 2.3 Calendar overlays (already renders exceptions)

File: [`src/lib/domain/calendarInstances.ts`](../../src/lib/domain/calendarInstances.ts)

What it does today:

- Queries exceptions overlapping the requested calendar range
- Expands each exception into `overlay` background events for each day
- Labels overlays as:
  - `Holiday: ...`
  - `Break: ...`
  - `Exam period: ...`

Status:

- ✅ Implemented overlay rendering
- Gap vs spec:
  - no filter chip per exception type (only layer-level `showLayerOverlays` exists)
  - tooltip may not include date range; `extendedProps` currently includes `overlayType` and `exceptionId`
  - overlay time window is hard-coded to `8–17` instead of using exception-specific times (exceptions are date ranges, so this may be acceptable, but the spec expects clearer UX)

### 2.4 Recurring exam preview/commit (exceptions are treated as skip, not conflict)

Files:

- [`src/lib/domain/recurringExamRules.ts`](../../src/lib/domain/recurringExamRules.ts)
- [`src/app/api/schools/[schoolId]/exams/recurring/preview/route.ts`](../../src/app/api/schools/[schoolId]/exams/recurring/preview/route.ts)
- [`src/app/api/schools/[schoolId]/exams/recurring/commit/route.ts`](../../src/app/api/schools/[schoolId]/exams/recurring/commit/route.ts)

What it does today:

- During preview expansion:
  - detects overlapping term exceptions for each occurrence
  - marks overlapping occurrences as `status: "skip"` with reason = exception type (`HOLIDAY`, `BREAK`, `EXAM_PERIOD`)
- During commit:
  - strict mode aborts only when occurrences are classified as `status: "conflict"` (conflicts arise from overlapping exams with class/teacher/room rules)
  - skipped exception occurrences do not cause strict-mode abort

Status:

- ✅ Implemented “skip on exceptions”
- Gap vs spec:
  - spec requires “exception conflicts” with strict mode fail or lenient skip
  - current behavior is only skip, no exception conflict classification

### 2.5 Exam period linkage (partially implemented)

Files:

- [`src/lib/actions.ts`](../../src/lib/actions.ts) (`createExam`, `updateExam`)
- [`src/components/FormContainer.tsx`](../../src/components/FormContainer.tsx) (`case "exam"`)
- [`src/components/forms/ExamForm.tsx`](../../src/components/forms/ExamForm.tsx)

What it does today:

- `createExam` / `updateExam` validate `examPeriodId` exists and has type `EXAM_PERIOD`.
- `FormContainer` loads exam periods as:
  - all `SchoolCalendarException` of type `EXAM_PERIOD` for the school (no term filter)
- `ExamForm` renders a dropdown listing `period.title` only (no date range label)

Status:

- ✅ Type constraint enforced (EXAM_PERIOD only)
- Gap vs spec:
  - spec requires term-scoped dropdown (current/selected term)
  - spec requires date-range in option labels

### 2.6 Calendar exception CRUD API (partial)

File:

- [`src/app/api/schools/[schoolId]/terms/[termId]/calendar-exceptions/route.ts`](../../src/app/api/schools/[schoolId]/terms/[termId]/calendar-exceptions/route.ts)

What it does today:

- `GET`:
  - authenticated + school-scoped via `requireSchoolAccess`
  - returns all exceptions for `schoolId` and `termId`
  - no type filter and no from/to range query
  - no pagination (not required by spec, but range filtering is)
- `POST`:
  - admin-only
  - validates input with `schoolCalendarExceptionCreateSchema`
  - verifies term exists + term not archived
  - enforces `assertCalendarExceptionWithinTerm`

Missing:

- ❌ `PATCH` endpoint
- ❌ `DELETE` endpoint
- ❌ in-use guard for `EXAM_PERIOD` deletion (or forced unlink behavior)
- ❌ auditing for create/update/delete
- ❌ GET query options (`type`, `from`, `to`)

### 2.7 Scheduling diagnostics (does not include exception history)

Files:

- [`src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/route.ts`](../../src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/route.ts)
- [`src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/SchedulingDiagnosticsClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/SchedulingDiagnosticsClient.tsx)

What it shows today:

- term schedule generation logs
- recurring exam commit logs
- lesson session override audit rows

Missing:

- ❌ exception create/update/delete audit history
- ❌ counts by type
- ❌ latest exception-caused conflicts

---

## 3) What Must Be Added to Fully Meet the Spec (Gaps Checklist)

Treat this as the implementation backlog. Any item marked “already implemented” can still be improved to align UX/strictness with the spec.

### 3.1 API

1. Add `PATCH` exception routes
- [ ] `PATCH /api/schools/[schoolId]/terms/[termId]/calendar-exceptions/[exceptionId]`
- [ ] Admin-only; reject archived term
- [ ] Validate start/end in-term boundaries after update
- [ ] School/term scoping with correct 404 vs 403 vs validation errors
- [ ] Audit row on update

2. Add `DELETE` exception routes with in-use guard
- [ ] `DELETE /api/schools/[schoolId]/terms/[termId]/calendar-exceptions/[exceptionId]`
- [ ] Admin-only; reject archived term
- [ ] If exception type is `EXAM_PERIOD` and exams are linked:
  - default behavior: reject with `CALENDAR_EXCEPTION_IN_USE`
  - optional: support explicit force-unlink choice for advanced UX (spec)
- [ ] Audit row on delete

3. Upgrade `GET` query options
- [ ] `GET .../calendar-exceptions?type=...&from=...&to=...`
- [ ] Keep response shape stable

### 3.2 Audit + diagnostics

1. Add exception audit model/table
- [ ] Add `CalendarExceptionAudit` (or similar) in Prisma
- [ ] Log create/update/delete including before/after payload and `actorAuthId`

2. Extend scheduling diagnostics
- [ ] Add recent exception audits
- [ ] Add counts by type
- [ ] Optionally include latest exception-caused conflicts if the system records them

### 3.3 UI

1. Build dedicated admin page
- [ ] `/schools/[schoolId]/admin/calendar-exceptions`
- [ ] term selector + exception list grouped by type/date
- [ ] create/edit drawer/modal with full form validation + deterministic server errors
- [ ] delete with confirmation and clear in-use messaging

2. Add calendar overlay filters per type
- [ ] In admin schedule and teacher schedule UIs, add chips for:
  - Holidays
  - Breaks
  - Exam periods
- [ ] Ensure tooltip includes title/type/date range

3. Improve exam form `Exam Period` dropdown
- [ ] Restrict dropdown options to `EXAM_PERIOD` exceptions within the current/selected term
- [ ] Update option label to include date range (e.g. `Title (Oct 10–Oct 17)`)
- [ ] Ensure it remains school-scoped

### 3.4 Engine strictness for recurring exams

Current behavior:

- Exceptions overlapping an occurrence result in `status: "skip"`.
- Strict mode aborts only on `status: "conflict"` from exam overlap rules.

Spec requires:

- Exceptions should produce “exception conflicts”
- strict mode: abort if exception conflicts exist
- lenient mode: skip conflicted rows

So we must decide:

- [ ] Introduce new status or reuse conflict with reason prefix (e.g. `EXCEPTION_HOLIDAY`, etc.)
- [ ] Update commit route strict check to include exception conflicts in strict mode

### 3.5 Testing + E2E

Unit tests:

- [ ] in-term boundary checks
- [ ] `startDate < endDate`
- [ ] mapping utilities for type -> reason

Integration tests:

- [ ] GET auth/role checks and scoping
- [ ] POST input validation
- [ ] PATCH rules (archived term, out-of-range)
- [ ] DELETE in-use conflict behavior for `EXAM_PERIOD`

E2E:

- [ ] admin creates holiday in active term
- [ ] calendar shows overlay
- [ ] dry-run generation skip counters include holiday
- [ ] exam form lists exam periods in selected term

---

## 4) Implementation Phases (Ordered, Production-Safe)

### Phase A — API + domain validation + audit plumbing

1. Implement `PATCH` + `DELETE` routes in:
   - `src/app/api/schools/[schoolId]/terms/[termId]/calendar-exceptions/[exceptionId]/route.ts`
2. Add in-use guard for delete of `EXAM_PERIOD`
3. Add audit rows for create/update/delete

Exit criteria:

- exceptions can be fully CRUD-managed by admin, with deterministic errors and no unlink-by-accident

### Phase B — UI admin management page

1. Create `/admin/calendar-exceptions` page + client component
2. Build create/edit modal with field-level errors
3. Add delete confirmation and handle `CALENDAR_EXCEPTION_IN_USE`

Exit criteria:

- admins can manage holidays/breaks/exam periods without manual API calls

### Phase C — Calendar UX and overlay filtering

1. Add filter chips for overlay types
2. Ensure tooltips include date range + type + title

Exit criteria:

- teacher/admin schedule becomes explorable without confusion

### Phase D — Exam form improvements

1. Make exam period dropdown term-scoped
2. Update labels to include date ranges

Exit criteria:

- exam period linkage is clear and constrained

### Phase E — Recurring exam strict/lenient behavior for exceptions

1. Decide conflict classification for exceptions
2. Update preview and commit logic accordingly

Exit criteria:

- strict mode behaves exactly per spec when exception conflicts exist

### Phase F — Diagnostics upgrades and tests

1. Extend scheduling diagnostics UI + API route
2. Add unit + integration tests for the CRUD + delete guard
3. Add (optional) E2E coverage for the end-to-end scenario

Exit criteria:

- behavior is stable, explainable, and regression-resistant

---

## 5) File Touch List (High-Confidence Targets)

- API routes:
  - [`src/app/api/schools/[schoolId]/terms/[termId]/calendar-exceptions/route.ts`](../../src/app/api/schools/[schoolId]/terms/[termId]/calendar-exceptions/route.ts) (GET/POST enhancements)
  - New: `src/app/api/schools/[schoolId]/terms/[termId]/calendar-exceptions/[exceptionId]/route.ts` (PATCH/DELETE)
- Domain:
  - [`src/lib/domain/termLessonGenerationRules.ts`](../../src/lib/domain/termLessonGenerationRules.ts) (verify skip reason counters + UX expectations)
  - [`src/lib/domain/calendarInstances.ts`](../../src/lib/domain/calendarInstances.ts) (overlay filtering/type UX)
  - [`src/lib/domain/recurringExamRules.ts`](../../src/lib/domain/recurringExamRules.ts) (exception conflict classification)
- Exam linkage:
  - [`src/components/FormContainer.tsx`](../../src/components/FormContainer.tsx) (term-scoped `examPeriods` in relatedData)
  - [`src/components/forms/ExamForm.tsx`](../../src/components/forms/ExamForm.tsx) (option labels)
  - [`src/lib/actions.ts`](../../src/lib/actions.ts) (validate examPeriodId type is EXAM_PERIOD; optionally enforce term)
- Diagnostics:
  - [`src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/route.ts`](../../src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/route.ts)
  - [`src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/SchedulingDiagnosticsClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/scheduling-diagnostics/SchedulingDiagnosticsClient.tsx)
- Schema:
  - `prisma/schema.prisma` (add exception audit model)

---

## 6) Open Decisions (Before Coding)

These are the only points that materially change how we implement the spec:

1. Recurring exam exceptions:
   - Should exceptions be treated as “conflict” in strict mode (per spec), or remain as “skip” (current behavior)?
   - If conflict: should strict abort include them or only overlap-conflicts between exams?

2. Delete behavior for in-use `EXAM_PERIOD`:
   - Reject by default (spec default)
   - Optional: allow “force unlink” via UI with explicit confirmation

If you confirm these two decisions, the rest of the guide can be implemented deterministically.

