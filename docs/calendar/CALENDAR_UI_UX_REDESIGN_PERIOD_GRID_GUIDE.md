# Calendar UI/UX Redesign Guide (Period-Grid First)

## Objective

Redesign the scheduling calendar experience end-to-end so it is:

- Bell-period first (rows as period blocks, not generic time slots)
- Easier to scan for lessons, exams, pop quizzes, and assignment due hints
- Clear and explicit for calendar exceptions (`HOLIDAY`, `BREAK`, `EXAM_PERIOD`)
- Modern, clean, and consistent across admin and teacher views

This guide is the implementation blueprint and rollout checklist.

---

## Product Vision

Replace the current "floating events on time grid" as the primary experience with a structured **Period Grid**:

- Columns = weekdays
- Rows = active bell periods (Period 1..N)
- Cells = the true unit of scheduling

Each cell should quickly answer:

1. What lesson is here?
2. Is there an exam in this block?
3. Is there a pop quiz?
4. Is an assignment due for this lesson today?
5. Is this day/cell affected by an exception?

---

## Design Principles

1. **Period clarity first**: time is represented by named periods, not raw timestamps.
2. **Information hierarchy**: lesson > exam > warning states > metadata chips.
3. **Low cognitive load**: avoid overlapping floating rectangles when not needed.
4. **Deterministic rendering**: same data always produces same visual outcome.
5. **Role-aware UX**: admin can edit/inspect deeply; teacher view is focused and read-first.
6. **Progressive disclosure**: concise blocks + details drawer on interaction.

---

## Current Data Foundation (already available)

Existing calendar instance payload already supports redesign needs:

- Event `kind`: `lesson_session`, `exam`, `overlay`
- Lesson metadata and effective teacher/room
- `popQuizzes` per lesson session
- `assignmentDue` hints per lesson session
- Exception overlays with type and date range metadata

Because of this, redesign is mostly **presentation + interaction architecture**, not domain rewrite.

---

## Target UX Architecture

## 1) Main layout

- Top bar:
  - view controls (Week, Day)
  - date navigation
  - filters (Lessons / Exams / Exceptions)
  - density toggle (Comfortable / Compact)
- Main canvas:
  - left rail: period labels + time ranges
  - center: day columns x period rows
  - optional right panel: selected block details

## 2) Cell content model

Inside each period cell:

- Primary lesson card (if any)
- Optional exam chip/card
- Optional metadata chips:
  - `Pop Quiz`
  - `Assignment Due`
- Availability/empty state when no events

## 3) Exception representation

Exceptions should appear in two complementary layers:

- **Day ribbon** (top of day column): "Holiday", "Break", "Exam Period" badges
- **Cell tinting** (all affected period rows): subtle background to signal impact

Tooltip/popover content:

- Exception title
- Type
- Date range
- Notes (if present)

## 4) Interaction model

- Click lesson/exam -> open details drawer
- Hover -> quick preview tooltip
- Admin actions from drawer (where allowed)
- Keyboard navigation support for period cells

---

## Visual Design Specification

## Color semantics

- Lesson: primary blue surface
- Exam: strong contrasting color (e.g. red/amber depending on category)
- Pop Quiz chip: purple
- Assignment Due chip: orange
- Holiday tint: cool neutral
- Break tint: teal/green neutral
- Exam period tint: warm neutral

All colors must pass contrast in both light and dark text contexts.

## Typography and spacing

- Cell title: 13–14px semibold
- Metadata line: 11–12px
- Chip text: 10–11px
- Row height:
  - Comfortable: ~88–104px
  - Compact: ~60–72px

## Card anatomy

- Rounded corners (8–12px)
- 1px border + subtle shadow
- Maximum 2 lines title truncation
- Secondary line for teacher/room

---

## Technical Implementation Plan (Step by Step)

## Phase 0 — Planning and guardrails

1. Confirm design tokens to reuse from current app theme.
2. Define feature flag name (example: `periodGridCalendarEnabled`).
3. Keep existing calendar as fallback during rollout.

Deliverable: implementation-ready scope and migration strategy.

## Phase 1 — View-model adapter layer

Create a pure mapping layer:

- Input: current calendar instance API payload
- Output:
  - `days[]`
  - `periodRows[]`
  - `cells[day][period]`
  - exception ribbons/tints

Rules:

- deterministic sorting
- stable IDs for keys
- explicit precedence (lesson, exam, chips, exception state)

Deliverable: tested adapter functions independent of UI.

## Phase 2 — New reusable UI components

Build component set:

1. `PeriodGridCalendar`
2. `PeriodGridHeader`
3. `PeriodRowLabel`
4. `PeriodCell`
5. `LessonBlockCard`
6. `ExamInlineCard`
7. `ExceptionDayRibbon`
8. `ScheduleDetailsDrawer`

Deliverable: render static mock data and edge states.

## Phase 3 — Data wiring in admin schedule

1. Plug adapter + components into admin schedule page.
2. Keep old calendar under a toggle/fallback.
3. Preserve existing filters and add exception subtype chips.
4. Keep existing modal behaviors for lesson session interactions.

Deliverable: admin can fully use period-grid view.

## Phase 4 — Teacher schedule integration

1. Reuse same grid shell with teacher-specific action set.
2. Keep teacher availability overlays consistent.
3. Ensure performance on lower-power devices.

Deliverable: teacher schedule parity with admin where applicable.

## Phase 5 — Exception UX polish

1. Improve exception legend + visual consistency.
2. Add grouped day indicators for multi-day exceptions.
3. Ensure exception tooltips include all critical metadata.

Deliverable: exception states are clear at a glance.

## Phase 6 — Responsive and accessibility pass

1. Mobile mode: period rows collapse into per-day stacked timeline cards.
2. Keyboard traversal for cells and drawer actions.
3. ARIA labels for period/day/cell semantic context.
4. Contrast and focus-ring audit.

Deliverable: accessible and usable responsive UX.

## Phase 7 — Performance and stability

1. Memoize heavy mapping and render paths.
2. Virtualize if row/column density gets high.
3. Avoid unnecessary re-fetch and expensive transforms on every rerender.

Deliverable: smooth rendering at school scale data volumes.

## Phase 8 — Rollout and migration

1. Enable feature for internal/admin pilot school.
2. Monitor regressions and interaction errors.
3. Expand to all schools when stable.
4. Keep legacy fallback for one release cycle.

Deliverable: safe production rollout.

---

## Rendering Rules (Canonical)

For each cell:

1. Determine exception impact.
2. Render lesson block if present.
3. Render exam chip/card if present in same period.
4. Render chips:
   - quiz count or quiz indicator
   - assignment due indicator
5. Apply conflict state if overlapping invalid combinations exist.

Precedence for attention styling:

`Conflict > Exception blocked > Exam > Lesson > Metadata`

---

## Edge Cases to Handle Explicitly

1. Multi-period lesson spanning contiguous periods.
2. Exception covering only partial day vs full day.
3. Exam linked to a period but no lesson in that cell.
4. Canceled lesson session with existing exam.
5. Multiple quizzes/assignments associated with same lesson/day.
6. DST/timezone boundaries around period labels.

---

## Testing Plan

## Unit tests

- adapter mapping deterministic output
- precedence and conflict resolution
- exception range-to-cell mapping

## Integration tests

- admin/teacher page renders with mixed dataset
- filter behavior (lesson/exam/exception subtype toggles)
- details drawer shows correct source metadata

## E2E tests

1. Create exception -> grid ribbon/tint appears
2. Lesson with pop quiz + assignment due -> chips render in correct cell
3. Exam in period -> exam shown in dedicated block
4. Toggle filters -> visibility updates correctly

---

## Definition of Done

Redesign is complete when:

1. Period-grid view is default for admin and teacher schedule pages.
2. Lessons, exams, quiz/due hints, and exceptions are all readable in one scan.
3. Exception periods are represented clearly at day and cell level.
4. UX passes accessibility baseline and responsive checks.
5. Legacy calendar remains optional fallback for one release.
6. Tests cover adapter logic + critical user flows.

---

## Implementation Checklist

- [ ] Add feature flag and fallback routing
- [ ] Build view-model adapter for period-grid
- [ ] Build period-grid component suite
- [ ] Integrate admin schedule
- [ ] Integrate teacher schedule
- [ ] Add exception ribbons/tint/tooltip
- [ ] Add quiz and assignment due chips in cells
- [ ] Add exam inline card in dedicated period block
- [ ] Add details drawer interactions
- [ ] Finish responsive + accessibility pass
- [ ] Add unit/integration/e2e coverage
- [ ] Pilot rollout and monitor regressions

