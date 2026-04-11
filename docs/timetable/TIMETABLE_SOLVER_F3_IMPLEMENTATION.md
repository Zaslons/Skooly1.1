# Phase F.3 — Soft goals (CP-SAT weighted objective)

**Authority:** [TIMETABLE_SOLVER_PHASE_F_DESIGN.md](./TIMETABLE_SOLVER_PHASE_F_DESIGN.md) §5.1, milestone F.3.

## Endpoints

| Service | Route | Purpose |
|---------|-------|---------|
| Python | `POST /solve-feasibility` | Hard constraints only (F.2); `schemaVersion: 1`. |
| Python | `POST /solve-optimize` | Same hard model + minimize `Σ linearCost[i][k]·x[i][k] + Σ coeff·z` (F.3); `schemaVersion: 2`. |

Pairwise terms use auxiliary booleans `z` with standard linearization: `z ≤ x[i][k]`, `z ≤ x[j][l]`, `z ≥ x[i][k] + x[j][l] - 1` for `i < j`.

## TypeScript

- **Penalties:** [`src/lib/domain/timetableSoftGoals.ts`](../../src/lib/domain/timetableSoftGoals.ts) — `DEFAULT_SOFT_WEIGHTS` (SG1–SG4 = 10, 15, 10, 10), `buildSoftObjectiveInputs`.
- **Client:** [`src/lib/domain/timetableSolverFeasibility.ts`](../../src/lib/domain/timetableSolverFeasibility.ts) — `runCpSatOptimizePlacement` → `/solve-optimize`; `runCpSatFeasibilityPlacement` unchanged → `/solve-feasibility`.
- **App:** [`src/lib/timetableAssistantService.ts`](../../src/lib/timetableAssistantService.ts) — `preview-optimize` / `preview-optimize-school` call the optimizer unless `TIMETABLE_SOLVER_FEASIBILITY_ONLY=1`.

## v1 penalty shapes (integers for OR-Tools)

Weights multiply scaled building blocks; coefficients are merged per `(i,k,j,l)` with `i < j`.

| ID | Formulation (v1) |
|----|-------------------|
| **SG2** | Same `requirementIndex` and `classId`; candidate pair same calendar `day` → pairwise coeff `w2 × 100`. |
| **SG3** | Same `classId`; both tasks have non-null `roomId` and they differ → `w3 × 100` on that candidate pair. |
| **SG1** | Same `teacherId`, same `day`, intervals disjoint → gap (minutes) scaled by `/5` and `×100`, then `× w1`. |
| **SG4** | Same `classId`, same `day`, intervals disjoint → same gap scaling as SG1, `× w4`. |

Gap minutes use wall-clock difference between the end of the earlier interval and the start of the later. Overlapping or identical intervals contribute no gap term.

**Scaling:** Large pairwise coefficients are clamped (see `MAX_PAIR_COEFF` in TS / Python) to reduce overflow risk.

## Debugging

Set **`TIMETABLE_SOLVER_FEASIBILITY_ONLY=1`** to force `/solve-feasibility` (no soft objective) while keeping the same routes and request shape otherwise.
