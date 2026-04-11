# Timetable auto-optimization — design & implementation plan (Phase F)

This document defines **what** we will build for solver-backed / hybrid timetabling (**Phase F** in [TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md](./TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md)), **how** we will develop it in stages, and **when** each slice is “done.” It complements [TIMETABLE_ASSISTANT_MVP.md](./TIMETABLE_ASSISTANT_MVP.md) (greedy MVP + Phase E) and [LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md](../scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md) §8.

**Status:** **F.0–F.4 complete** (2026-03-20) — through admin UI for CP-SAT preview ([`TimetableAssistantClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/timetable-assistant/TimetableAssistantClient.tsx), [`TimetableAssistantSchoolClient.tsx`](../../src/app/(dashboard)/schools/[schoolId]/admin/timetable-assistant/school/TimetableAssistantSchoolClient.tsx)); solver gated by `TIMETABLE_SOLVER_ENABLED`. Optional follow-ups: §13 (weights UI, school opt-in).

---

## 1. Relationship to Phase F

| Artifact | Role |
|----------|------|
| **This document** | Product constraints, soft goals, phased **development plan**, acceptance criteria, risks. |
| **Phase F (code)** | Implementation: feasibility predicates, optional **CP-SAT** (or similar), APIs/UI when ready. |

Do not implement a full solver without **locking soft-goal weights** (§5) and **milestones** (§10); otherwise scope and runtime explode.

---

## 2. Current baseline (what we are improving)

| Area | Today | Phase F target |
|------|--------|----------------|
| Placement | Greedy [`timetableAssistant.ts`](../../src/lib/domain/timetableAssistant.ts) | Feasible + optionally **optimal** under soft goals |
| Teacher availability | Checked on **commit** and in **greedy preview** (F.1) [`timetableTeacherAvailability.ts`](../../src/lib/domain/timetableTeacherAvailability.ts) | Same rules for solver paths when added |
| Multi-period | Phase E: `blockSize`, spans | Same discrete slots; solver assigns tasks to slots |
| UX | Preview + commit | Greedy unchanged; **optional** “Optimize” path behind flag (see **Milestone F.4**, §10) |

---

## 3. Problem statement

**Inputs (unchanged from assistant):** bell periods, Mon–Fri; requirement rows (class, subject, teacher, `periodsPerWeek`, `blockSize`, optional room); scope for whole-school flows.

**Hard inputs:** existing weekly `Lesson` occupancy (per preview replace rules), teacher **unavailable** windows, rooms.

**Outputs:**

1. **Feasible** placement satisfying all **hard** constraints (§4), including availability in the same pass as placement for the optimized path.
2. Optionally **best** placement under **soft** goals (§5).

**Pattern intelligence** (e.g. stack blocks on one day vs spread) appears only as **soft objectives**, never as an undocumented heuristic.

---

## 4. Hard constraints (must match `createLesson` / assistant parity)

These must use **one shared validation story** for preview, commit, and solver (§9.1).

- No overlapping intervals for the same **teacher** (any class).
- No overlapping intervals for the same **class**.
- **Room:** if both lessons specify a room, same room cannot overlap in time.
- **Bell policy:** times must match a valid period or contiguous span (`validateLessonTimesAgainstBellPolicy`, including `periodSpan` for multi-period).
- **Teacher unavailable:** proposed lesson interval must not overlap a slot where `teacherAvailability` marks **unavailable** (same logic as `teacherUnavailableMessage` today).
- **Contiguous spans:** `blockSize` only on consecutive period `order` (same as [`listContiguousPeriodSpans`](../../src/lib/domain/timetableAssistant.ts) semantics).

---

## 5. Soft goals (product — set weights before solver coding)

### 5.1 F.0 lock — default strategy (v1)

**Approach:** Two phases in the optimizer (F.2 / F.3):

1. **Feasibility (F.2):** Hard constraints only — no soft terms.
2. **Optimization (F.3):** Single **weighted sum** of normalized penalty terms for SG1–SG4 (all minimized). CP-SAT minimizes `Σ weight_i × penalty_i` with integer weights below.

**Default weights (v1, tunable later per school or request body):**

| ID | Goal | Default weight | Rationale |
|----|------|----------------|-----------|
| SG1 | Minimize **idle gaps** in a teacher’s day | **10** | Baseline quality. |
| SG2 | **Spread** blocks for the same requirement across **days** | **15** | Slightly higher than SG1/SG3/SG4 so “don’t stack everything on one day” wins modestly over raw compactness. |
| SG3 | Minimize **room churn** / prefer default room | **10** | Equal baseline with SG1/SG4. |
| SG4 | Minimize **gaps between lessons** for a class (compact day) | **10** | Tension with SG2; net behavior = moderate spread without destroying compactness. |

**SG2 vs SG4:** When they conflict, **defaults** favor **spread (SG2)** slightly via weight 15 vs 10. Product can expose sliders later; F.3 implements **constants in code** first, optional JSON override for admins in F.4.

**Lexicographic alternative (not v1 default):** If weighted sum is unstable in testing, fallback documented: optimize feasibility → then minimize SG2 penalty only → then SG1+SG3+SG4. Only switch if engineering recommends it after F.3 spikes.

**Penalty definitions** (how each term is computed from a timetable) are implemented in v1 as **pairwise CP-SAT terms** + integer scaling — see [TIMETABLE_SOLVER_F3_IMPLEMENTATION.md](./TIMETABLE_SOLVER_F3_IMPLEMENTATION.md) and [`timetableSoftGoals.ts`](../../src/lib/domain/timetableSoftGoals.ts). Weights §5.1 multiply those building blocks.

**Without soft weights:** F.2 remains **feasibility-only**; F.3 adds the weighted terms above (via `/solve-optimize`).

### 5.2 F.3 — exact v1 formulas (summary)

| ID | v1 implementation |
|----|-------------------|
| SG2 | For each unordered task pair with same `requirementIndex` and `classId`, for each candidate pair on the **same day**, add pairwise penalty `w2 × 100` (encourages spreading across days). |
| SG1 | Same teacher, same day, non-overlapping candidate intervals: penalty ∝ gap minutes (scaled) × `w1`. |
| SG4 | Same class, same day, non-overlapping intervals: penalty ∝ gap minutes (scaled) × `w4`. |
| SG3 | Same class; both tasks have a fixed `roomId` and they differ: pairwise `w3 × 100` on that candidate pair. |

Full detail, auxiliary `z` variables, and env toggles: [TIMETABLE_SOLVER_F3_IMPLEMENTATION.md](./TIMETABLE_SOLVER_F3_IMPLEMENTATION.md).

---

## 6. Recommended technical approach

### 6.1 Single feasibility core

Extract or centralize:

- Interval overlap (teacher / class / room).
- Teacher unavailable overlay.
- Bell-valid interval for `(day, span)`.

Use from: greedy (optional), solver post-check, commit. **No duplicate drift.**

### 6.2 Solver choice

- **Primary recommendation:** **Google OR-Tools CP-SAT** (CP-SAT) for discrete assignment variables: each placement task maps to a slot index `(day × start_period_index)` from a pre-enumerated feasible list (respecting `blockSize` and contiguity).
- **Alternatives:** integer programming with a commercial solver (licensing); **local search** (simulated annealing) on permutations — acceptable for F.3 if CP-SAT proves too heavy for v1 scope.

### 6.3 Hybrid strategy (aligns with milestones)

- Keep **greedy** as default, fast, deterministic.
- Add **“Optimize”** (or server flag) that runs CP-SAT on the **same** inputs; timeout + fallback message.

---

## 7. Non-goals (initial releases)

- Parent/student preference voting.
- Curriculum CSV / automatic requirement generation (separate roadmap).
- Changing meaning of `periodsPerWeek` without data migration.
- Real-time collaborative editing of the grid.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| **Complexity** | Staged milestones; feasibility-only before soft goals. |
| **Runtime** | Time limits; max tasks per request; scope limits (class/grade). |
| **Infeasible with no explanation** | Return minimal conflict set or human-readable reasons (solver APIs + custom extraction). |
| **UX** | Feature flag; dry-run diff vs greedy proposal. |
| **Dependencies** | Pin `or-tools` (or chosen lib); CI test on small fixtures. |

---

## 9. Engineering building blocks

### 9.1 Shared feasibility module

- **New or refactored module** e.g. `src/lib/domain/timetableFeasibility.ts` (name TBD) exposing:
  - `isSlotFeasible(task, proposedInterval, occupancy, unavailableSlices, …)`
  - Precompute **candidate slots** per task: list of `(day, startPeriodId, endPeriodId)` with times.

### 9.2 Data loading (service layer)

- Reuse patterns from [`timetableAssistantService.ts`](../../src/lib/timetableAssistantService.ts): periods, lessons, teacher availability, rooms.
- Solver entry point receives the same **internal model** as greedy (tasks + occupancy + unavailable).

### 9.3 Solver adapter

- `src/lib/domain/timetableSolverCpSat.ts` (or similar): build model, run, map solution → `TimetableProposal[]`.
- Pure-enough to unit-test with **tiny** grids (2 periods, 2 days).

### 9.4 API / UI (late milestone)

- Optional: `POST .../timetable-assistant/preview-optimize` with body compatible with existing preview + `objectives` / `weights` optional JSON.
- UI: toggle “Use optimizer” + show **diff** or **side-by-side** vs greedy (TBD).

---

## 10. Development & implementation roadmap

### Milestone F.0 — Product lock (this doc) — **COMPLETE**

**Completed:** 2026-03-20.

| Gate | Status |
|------|--------|
| Hard constraints (§4) | **Approved** as the parity baseline for solver + preview + commit. |
| Soft goals (§5) | **Default weights** locked in §5.1 (SG1:10, SG2:15, SG3:10, SG4:10). |
| Milestones F.1–F.4 | **Accepted** as the delivery sequence; no scope change without revising this doc. |
| Open decisions (§13) | **F.0-relevant items resolved** in §14; implementation tuning remains before F.2/F.4 code. |

**Deliverable:** This document + cross-link in [TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md](./TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md). No application code.

---

### Milestone F.1 — Availability-aware greedy preview — **complete** (2026-03-20)

**Goal:** Preview never proposes slots that fail `teacherUnavailableMessage` (parity with commit).

**Implemented:**

- Pure overlap helper: [`timetableTeacherAvailability.ts`](../../src/lib/domain/timetableTeacherAvailability.ts) (`lessonOverlapsTeacherUnavailable` / `lessonOverlapsTeacherUnavailableRows`); commit path uses the same rows-based check.
- Greedy: [`timetableAssistant.ts`](../../src/lib/domain/timetableAssistant.ts) `runGreedyPlacement` accepts optional `teacherUnavailableByTeacherId`; `computeTimetablePreview` / `computeTimetablePreviewSchool` pass it through.
- Service: [`timetableAssistantService.ts`](../../src/lib/timetableAssistantService.ts) loads `TeacherAvailability` (`isAvailable: false`) once per preview for requirement teachers and builds the map.

**Acceptance:** Single-class + whole-school preview: **no commit failure** solely due to availability when preview succeeded.

**Out of scope (unchanged):** CP-SAT; soft goals.

---

### Milestone F.2 — Feasibility-only CP-SAT (or equivalent) — **complete** (2026-03-20)

**Goal:** Find **any** feasible full assignment for the same tasks, or report **infeasible** with a minimal explanation (best-effort).

**Implemented:**

- **Python** FastAPI service: [`services/timetable-solver/`](../../services/timetable-solver/) — `POST /solve-feasibility` (F.2), `POST /solve-optimize` (F.3), OR-Tools CP-SAT, `TIMETABLE_SOLVER_SECRET` auth; [`docker-compose.yml`](../../docker-compose.yml) for local run.
- **Domain:** [`timetableFeasibility.ts`](../../src/lib/domain/timetableFeasibility.ts) (enumerate candidates, conflict pairs); [`timetableSoftGoals.ts`](../../src/lib/domain/timetableSoftGoals.ts) (SG1–SG4 costs); [`timetableSolverFeasibility.ts`](../../src/lib/domain/timetableSolverFeasibility.ts) (HTTP client, map solution → `TimetableProposal`).
- **Service:** [`runTimetableAssistantPreviewOptimize` / `runTimetableAssistantSchoolPreviewOptimize`](../../src/lib/timetableAssistantService.ts) — env `TIMETABLE_SOLVER_ENABLED`, `TIMETABLE_SOLVER_URL`, `TIMETABLE_SOLVER_SECRET`; optional `TIMETABLE_SOLVER_FEASIBILITY_ONLY=1` to skip soft objective; cap 300 tasks; 30s timeout.
- **API:** `POST .../timetable-assistant/preview-optimize`, `POST .../timetable-assistant/preview-optimize-school` (same bodies as greedy preview).

**Acceptance:** Golden tests on small grids; infeasible case returns structured error; feasible case matches hard rules verified by existing validators.

**Out of scope (unchanged):** request-body weight sliders (future product); admin UI delivered in F.4.

---

### Milestone F.3 — Soft goals

**Status:** **Complete** (2026-03-20). Engineering: [TIMETABLE_SOLVER_F3_IMPLEMENTATION.md](./TIMETABLE_SOLVER_F3_IMPLEMENTATION.md).

**Shipped:** `POST /solve-optimize` with `linearCost` + `pairwiseTerms`; TS `buildSoftObjectiveInputs` + `runCpSatOptimizePlacement`; `preview-optimize` routes use the optimizer by default.

**Acceptance:** Unit tests (TS + Python) for objective + hard constraints; F.2 regression unchanged.

---

### Milestone F.4 — Product integration

**Status:** **Complete** (2026-03-20). Detail: [TIMETABLE_SOLVER_F4_IMPLEMENTATION.md](./TIMETABLE_SOLVER_F4_IMPLEMENTATION.md).

**Goal:** Admins can run optimizer from UI safely.

**Shipped:**

1. API (from F.2/F.3): `preview-optimize` / `preview-optimize-school` with Zod, admin guard, domain errors + HTTP status.
2. UI: When `TIMETABLE_SOLVER_ENABLED=1`, **Preview (greedy)** vs **Preview (CP-SAT)** on single-class and whole-school timetable assistant pages; Greedy/CP-SAT tabs when both previews exist; **Commit** uses the active tab’s grid.
3. Docs: MVP manual QA, lesson scheduling §8, whole-school plan.

**Acceptance:** Manual QA checklist in [TIMETABLE_ASSISTANT_MVP.md](./TIMETABLE_ASSISTANT_MVP.md); server flag default **off** in production until ops enable `TIMETABLE_SOLVER_ENABLED`.

---

## 11. Testing strategy

| Layer | What |
|-------|------|
| **Unit** | Slot enumeration; overlap vs unavailable; CP-SAT tiny models. |
| **Integration** | Service: preview-optimize with mocked or seed DB. |
| **E2E (optional)** | Playwright: admin toggles optimize, sees preview table. |

Performance: benchmark worst-case school size **before** enabling flag globally.

---

## 12. Documentation & cross-links

| Doc | Update when |
|-----|-------------|
| [TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md](./TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md) | Phase F status; link here |
| [TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md](./TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md) | F.2 engineering steps; update when spike + milestones land |
| [TIMETABLE_SOLVER_F3_IMPLEMENTATION.md](./TIMETABLE_SOLVER_F3_IMPLEMENTATION.md) | F.3 soft objective schema, SG1–SG4 v1, env toggles |
| [TIMETABLE_ASSISTANT_MVP.md](./TIMETABLE_ASSISTANT_MVP.md) | Optimizer endpoints, UI, manual QA |
| [TIMETABLE_SOLVER_F4_IMPLEMENTATION.md](./TIMETABLE_SOLVER_F4_IMPLEMENTATION.md) | F.4 UI entry points, env, QA |
| [LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md](../scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md) | §8 assistant capabilities |

---

## 13. Open decisions

### Resolved at F.0 (do not block F.1)

| Topic | Decision |
|-------|----------|
| Default weights SG1–SG4 | §5.1 — **10 / 15 / 10 / 10** |
| Solver library (v1) | **Google OR-Tools CP-SAT** primary; alternatives only if PoC fails |
| Feature flag (v1) | **Server env** `TIMETABLE_SOLVER_ENABLED` — `0` (default) / `1`; no DB field until product asks |
| API shape | **New route** `POST /api/schools/{schoolId}/timetable-assistant/preview-optimize` (and school-scoped variant if needed) — **do not** overload greedy preview body in F.2 |
| Limits (v1) | **Max 300** placement tasks per request; **30s** solver wall-clock timeout; return `408`-style or domain error with message |

### Revisit before / during F.3–F.4 implementation

- [x] **CP-SAT runtime (F.2):** **Python** OR-Tools in [`services/timetable-solver/`](../../services/timetable-solver/) — not in-process Node.
- [ ] **School-level** opt-in: add `School` field later if env-only is too coarse.
- [ ] **Weights** in request body: Zod schema + admin-only — future enhancement (not F.4).

---

## 14. F.0 decision log (audit)

| Date | Decision |
|------|----------|
| 2026-03-20 | Hard constraints §4 approved unchanged. |
| 2026-03-20 | Soft-goal default weights §5.1; weighted-sum model for F.3. |
| 2026-03-20 | OR-Tools CP-SAT as primary solver; env flag for optimizer paths. |
| 2026-03-20 | Separate `preview-optimize` API; caps 300 tasks / 30s. |
| 2026-03-20 | Milestones F.1–F.4 sequence locked. |

---

## Document history

- **Added:** Design precursor for Phase F / auto-optimization (B).
- **Updated:** Full **development & implementation roadmap** (F.0–F.4), soft goals table, engineering building blocks, testing, open decisions.
- **F.0 complete:** Default soft weights (§5.1), resolved open decisions (§13–§14), milestone F.0 marked done.
- **2026-03-20:** Linked [TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md](./TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md) for milestone F.2 implementation steps.
- **2026-03-20:** F.2 shipped — Python FastAPI solver + `preview-optimize` routes; §13 Node OR-Tools item superseded.
- **2026-03-20:** F.3 shipped — `/solve-optimize`, soft goals in TS [`timetableSoftGoals.ts`](../../src/lib/domain/timetableSoftGoals.ts); optional `TIMETABLE_SOLVER_FEASIBILITY_ONLY`.
- **2026-03-20:** F.4 shipped — timetable assistant UIs: greedy vs CP-SAT preview + tabs; `optimizerEnabled` from `TIMETABLE_SOLVER_ENABLED`.
