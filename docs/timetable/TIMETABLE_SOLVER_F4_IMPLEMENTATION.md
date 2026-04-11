# Phase F.4 — Admin UI (timetable assistant optimizer)

**Authority:** [TIMETABLE_SOLVER_PHASE_F_DESIGN.md](./TIMETABLE_SOLVER_PHASE_F_DESIGN.md) milestone F.4.

## Behavior

| Env (`TIMETABLE_SOLVER_ENABLED`) | UI |
|----------------------------------|-----|
| Not `1` (default in production) | **Preview (greedy)** / **Preview** only; no CP-SAT button. |
| `1` | **Preview (greedy)** and **Preview (CP-SAT)** on single-class and whole-school assistant pages. |

Server components pass `optimizerEnabled={process.env.TIMETABLE_SOLVER_ENABLED === "1"}` into:

- [`TimetableAssistantClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/timetable-assistant/TimetableAssistantClient.tsx)
- [`TimetableAssistantSchoolClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/timetable-assistant/school/TimetableAssistantSchoolClient.tsx)

When both greedy and CP-SAT previews have been run, **Greedy** / **CP-SAT** tabs compare grids. **Commit** validates and applies the **active** preview (same requirement body either way).

## Related APIs

- `POST .../timetable-assistant/preview` / `preview-school` — greedy.
- `POST .../timetable-assistant/preview-optimize` / `preview-optimize-school` — CP-SAT (F.2 + F.3). See [TIMETABLE_ASSISTANT_MVP.md](./TIMETABLE_ASSISTANT_MVP.md).

## Manual QA

See [TIMETABLE_ASSISTANT_MVP.md](./TIMETABLE_ASSISTANT_MVP.md) § Manual QA (F.4).
