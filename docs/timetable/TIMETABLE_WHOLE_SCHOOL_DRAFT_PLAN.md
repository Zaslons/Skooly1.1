# Whole-school timetable draft — development plan

This document plans **school-wide** (or **multi-class / grade-scoped**) automated drafting of weekly `Lesson` templates. It extends the single-class flow described in [TIMETABLE_ASSISTANT_MVP.md](./TIMETABLE_ASSISTANT_MVP.md) and aligns with [LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md](../scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md) §8.

**Status:** **Implemented (v1)** — greedy multi-class preview/commit with scoped replace and admin UI. Single-class assistant remains unchanged. Phases **A–D** and **E** (multi-period blocks, `blockSize`) are shipped. **Phase F:** CP-SAT **preview** is available in the same UI when `TIMETABLE_SOLVER_ENABLED=1` ([TIMETABLE_SOLVER_F4_IMPLEMENTATION.md](./TIMETABLE_SOLVER_F4_IMPLEMENTATION.md)); commit still uses the selected preview grid.

**UI:** `/schools/{schoolId}/admin/timetable-assistant/school`  
**APIs:** `POST /api/schools/{schoolId}/timetable-assistant/preview-school`, `POST /api/schools/{schoolId}/timetable-assistant/commit-school`  
**Templates:** `GET`/`PUT /api/schools/{schoolId}/timetable-assistant/grade-templates[...]` — persisted per-grade requirement prototypes (`TimetableGradeTemplate` in Prisma).

**Matrix + templates (v1):** The whole-school page supports **Table** vs **Matrix** entry. The matrix is **classes in scope × selected subjects**, with a default teacher per subject column and optional per-cell overrides; block size and room are global defaults for generated rows. **Per-grade templates** can be loaded/saved/applied without changing preview/commit request shapes — see [TIMETABLE_ASSISTANT_MVP.md](./TIMETABLE_ASSISTANT_MVP.md) § Whole-school draft.

---

## 1. Objective

Allow an admin to produce a **coherent draft** of weekly lesson templates across **many or all classes** in one run, with:

- **Hard constraints:** no double-booked teacher, no double-booked class, room conflicts when rooms are assigned (same rules as today).
- **Preview before commit:** no DB writes until acceptance (or per-scope partial commit).
- **Same downstream pipeline:** committed templates still feed **Generate lesson sessions for this term** (`generateTermLessons`) unchanged.

---

## 2. Why this differs from the current MVP

| Dimension | Current MVP ([`timetableAssistant.ts`](../../src/lib/domain/timetableAssistant.ts)) | Whole-school draft |
|-----------|----------------------------------------------------------------------------------|---------------------|
| Scope | One `classId` per request | Many classes; shared teachers and rooms across the school |
| Ordering | Greedy tasks in row order | Order of **classes** and **requirements** affects global feasibility |
| Failure mode | One class’s preview fails independently | One conflict can block many placements; need clear reporting |
| Data entry | Manual table per class | Likely **bulk** inputs (CSV/import, curriculum matrix, or repeated API) |

Whole-school timetabling is a **global** placement or **constraint optimization** problem at scale; the MVP is **local** greedy per class.

---

## 3. Prerequisites (product + data)

Before building UI/API, lock:

1. **Source of requirements** — Where do “N periods per week per (class, subject)” come from?
   - Manual matrix in UI (large grid).
   - Import from spreadsheet.
   - Derive from [`Curriculum`](../../prisma/schema.prisma) + new fields (e.g. hours per week per grade/subject) — may require schema work.
2. **Teacher–subject–class assignment** — Today: teacher must teach subject (M:N). Whole-school may need **explicit** “teacher X teaches subject Y for class Z” if one teacher teaches the same subject to multiple classes (already true) or **sectioning** rules.
3. **Commit granularity** — All-or-nothing vs **per grade** vs **per class** batches (reduces blast radius).
4. **Replace policy** — Replace existing templates **school-wide**, **per grade**, or **per class** only (mirror `replaceExistingClassLessons` but scoped).

---

## 4. Recommended technical approach (phased)

### Phase A — Foundation ✅ (v1)

- Shared overlap helpers and a single greedy loop (`runGreedyPlacement`) used by single-class and school previews — see [`timetableAssistant.ts`](../../src/lib/domain/timetableAssistant.ts).
- Unit tests: multi-class ordering, per-class capacity — [`timetableAssistant.test.ts`](../../tests/unit/timetableAssistant.test.ts).

### Phase B — Multi-class greedy (same algorithm, global occupancy) ✅ (v1)

- Input: ordered list of **placement tasks** derived from requirements for **multiple** `classId`s (each task still one single-period block unless Phase E is done).
- Maintain **one global occupancy structure** for the school week (teacher, class, room), identical to chaining multiple single-class runs in a fixed order — but **single preview** and **single conflict report**.
- Ordering strategies (pick one for v1, document the rest as follow-ups):
  - **Fixed class order** (e.g. by grade, then class name).
  - **Fixed priority** (e.g. exam years first).
  - **Random seed** (reproducible with seed for debugging).

**API sketch:**

- `POST .../timetable-assistant/preview-school`  
  Body: `{ scope: { type: "school" } | { type: "grade", gradeId } | { type: "classIds", ids: number[] }, requirements: ... }`  
  where `requirements` is either a nested structure per class or flat rows including `classId`.

- `POST .../timetable-assistant/commit-school`  
  Same body + `replaceScope: "none" | "affected_classes" | "school"` (exact enum TBD).

**Shipped:** `computeTimetablePreviewSchool`, Zod `timetableAssistantSchoolBodySchema`, service + routes above. Commit: transaction, `replaceScope`, term sync via `generateTermLessons` with `scope: { type: "school" }` when the pipeline is enabled.

### Phase C — UX ✅ (v1)

- Dedicated page with scope selector, requirement matrix (flat rows with `classId`), preview table with class/teacher filters, commit with extra confirmation when replacing templates (especially school-wide).
- **Matrix grid** (optional): class × subject grid + per-grade template load/save/apply — [`TimetableAssistantSchoolClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/timetable-assistant/school/TimetableAssistantSchoolClient.tsx), [`timetableRequirementMatrix.ts`](../../src/lib/domain/timetableRequirementMatrix.ts).
- Links from single-class assistant, Scheduling setup, and the admin menu.

### Phase D — Reporting and safety (minimal v1)

- **Summary:** API includes `placedByClass`, `unplacedByClass`, proposal counts, `scopeClassCount` (see service response).
- **Audit table:** not in v1; optional follow-up.

**Follow-ups:** heatmap export, idempotency key, dedicated audit table.

### Phase E — Multi-period blocks ✅

- Requirement rows include **`blockSize`** (default 1). Each row still has **`periodsPerWeek`** blocks per week; each block spans `blockSize` **consecutive** bell periods (by `order`, no gaps).
- Greedy placement uses [`computeLessonTimesFromPeriodSpan`](../../src/lib/domain/bellPeriodRules.ts); occupancy uses the full merged interval. Preview proposals include `endPeriodId` when `blockSize > 1`.
- Service validates with `validateLessonTimesAgainstBellPolicy(..., { periodSpan })` for multi-period intervals; commit sets `Lesson.periodId` / `Lesson.endPeriodId` accordingly.
- **Capacity:** per class, `sum(periodsPerWeek × blockSize) ≤ 5 × numPeriods`; rows with `blockSize` larger than the longest contiguous period run fail **CAPACITY**.

**Exit criteria:** Double-block (and longer contiguous) sessions appear as one `Lesson` with `periodId` + `endPeriodId`.

### Phase F — Solver-backed quality (not in v1)

- If greedy quality is insufficient at scale, introduce **CP-SAT** (or similar) for **hard constraints** + simple soft goals (minimize gaps). Keep greedy as fast fallback or “suggest then edit.”
- **Planning:** [TIMETABLE_SOLVER_PHASE_F_DESIGN.md](./TIMETABLE_SOLVER_PHASE_F_DESIGN.md). **F.2** (CP-SAT feasibility, [`services/timetable-solver/`](../../services/timetable-solver/), `preview-optimize-school`) is implemented; **F.3** soft goals next. Historical plan: [TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md](./TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md).
- **F.0 (product lock):** **Complete** — default soft weights, API/flag/limits, OR-Tools choice; see §5.1 and §14 in that doc.

**Exit criteria:** Documented when product requires optimality vs speed; code ships milestone-by-milestone per that doc.

---

## 5. Algorithm notes

- **Greedy multi-class** is **not optimal** but predictable and fast. Worst case: many **unplaced** tasks; surface them with **reason** (`NO_SLOT`, `CAPACITY`, `TEACHER_CONFLICT` after placement).
- **Ordering sensitivity:** Document default order in help text; consider “retry with shuffled order” as a **developer-only** or **power** tool.
- **Capacity check:** `totalTasks <= (5 days) × (periods per day) × (number of classes)` is **wrong** — capacity is **per teacher** and **per class** independently; preflight can only warn (e.g. sum of demands on teacher T exceeds available slots).

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| One bad bulk commit wipes templates | Scoped replace + confirmation + backup export (CSV of current lessons) before commit |
| Unreadable preview at scale | Pagination, filters, export; “only show conflicts” |
| Performance (1000+ tasks) | Batch DB reads once; in-memory placement; optional server timeout + chunking |
| Curriculum data missing | Phase A/B allow **manual** requirements first; import later |

---

## 7. Documentation and guide updates

When Phase B ships:

- Update [LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md](../scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md) §8.4 with a row for “Whole-school draft” and link here.
- Update [TIMETABLE_ASSISTANT_MVP.md](./TIMETABLE_ASSISTANT_MVP.md) with a short “Related” section pointing to this file.

---

## 8. Open decisions checklist

- [ ] Requirement matrix source of truth (UI vs import vs curriculum tables).
- [ ] Default scope: grade-by-grade rollout vs true whole school.
- [ ] Replace semantics and undo story.
- [ ] Whether to persist **draft** rows in DB vs stateless preview only (same debate as MVP).
- [x] Multi-period blocks (Phase E) — `blockSize` on single-class and whole-school assistants.

---

## Document history

- **Created:** whole-school draft development plan (planning document).
- **Updated:** v1 implementation (APIs, UI route, Phases A–C + minimal D).
- **Updated:** Phase E multi-period blocks (`blockSize`, `endPeriodId`, docs).
- **Updated:** Phase F design precursor — [TIMETABLE_SOLVER_PHASE_F_DESIGN.md](./TIMETABLE_SOLVER_PHASE_F_DESIGN.md).
- **Updated:** Phase F.0 product lock recorded in that doc (weights, flag, API shape).
