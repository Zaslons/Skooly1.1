# Online lessons — phased roadmap

**Goal:** Extend online lessons from “mode + no room + calendar label” to operationally useful: meeting context, sensible defaults in bulk flows, and visibility where schedules are consumed.

**Suggested order:** Phase A → Phase B → Phase C (if in scope) → Phase D (optional).

---

## Phase A — Meeting context (highest leverage)

### Data

Add optional `meetingUrl` (string, URL) and optionally `meetingLabel` or `meetingProvider` enum on:

- **`Lesson`** (weekly default), and
- **`LessonSession`** (override for one date),

mirroring how room overrides work.

### Rules

- `meetingUrl` only meaningful when `deliveryMode === ONLINE` (validate in Zod + server actions; clear or ignore when switching to `IN_PERSON`).
- **Template sync:** when template changes, optionally push URL to future sessions (same pattern as `syncLessonTemplateToCurrentTermSessions` for times/delivery).

### UI

- **LessonForm:** show URL + optional label when Online; hide/clear when In person.
- **Calendar / period grid:** expose in `extendedProps`; **LessonBlockCard** can show “Open link” or icon if URL present.

### Migration

One migration; nullable columns; no backfill required.

### Definition of done (Phase A)

- Create/update online lesson with optional URL; persisted on template and shown on calendar/session.
- Switching to `IN_PERSON` clears online-only fields.
- No regression on overlap or room rules.

---

## Phase B — Timetable assistant

- Extend `timetableAssistantRequirementSchema` (and solver payload) with optional `deliveryMode` or `online: boolean` per row.
- **`Lesson.create` in assistant:** set `deliveryMode` + `meetingUrl` if provided; default remains `IN_PERSON` if omitted.

---

## Phase C — Parents / students (if in scope)

- Same calendar DTO fields on any lesson views they use.
- Optional: strip or mask URL until same day (policy).

---

## Phase D — Reporting & polish (optional)

- Simple filter or column: online vs in-person hours.
- Admin diagnostics: list teachers with online lessons without URL.

---

## Implementation status (maintain as you ship)

| Phase | Scope | Status |
|-------|--------|--------|
| **A** | `meetingUrl` / `meetingLabel` on `Lesson` + `LessonSession`, validation, template sync, form, calendar `extendedProps`, period grid card | **Shipped** — see migration `20260327130000_lesson_meeting_url` and related app code |
| **B** | Timetable assistant rows + solver payload + `Lesson.create` | **Shipped** — optional `deliveryMode` / `meetingUrl` / `meetingLabel` on requirement schemas; greedy + CP-SAT proposals carry fields; commit persists; class + school **table** UI; matrix mode stays in-person default |
| **C** | Parent/student schedule consumers + optional URL policy | **Shipped** — calendar/period grid + student **My Weekly Schedule** show meeting links; optional “same-day only” URL masking not implemented |
| **D** | Hours filter/column + diagnostics | **Shipped (MVP)** — Admin **Scheduling diagnostics** shows weekly template minutes (online vs in-person) and a table of online templates missing a URL (up to 200); lesson list filter deferred |

**Note:** `meetingProvider` enum (vs free-text `meetingLabel`) is not required for Phase A; add only if product needs provider-specific behavior.
