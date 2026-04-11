/**
 * Soft goals SG1–SG4 for CP-SAT optimize (Phase F.3).
 * See docs/timetable/TIMETABLE_SOLVER_PHASE_F_DESIGN.md §5.1
 */

import type { PlacementTask } from "@/lib/domain/timetableAssistant";
import type { CandidateSlot } from "@/lib/domain/timetableFeasibility";
import { candidateIntervalsOverlap } from "@/lib/domain/timetableFeasibility";

/** §5.1 default weights (v1). */
export const DEFAULT_SOFT_WEIGHTS = {
  sg1: 10,
  sg2: 15,
  sg3: 10,
  sg4: 10,
} as const;

export type SoftGoalWeights = {
  sg1: number;
  sg2: number;
  sg3: number;
  sg4: number;
};

const SCALE = 100;
const GAP_DIVISOR = 5;
const MAX_PAIR_COEFF = 2_000_000;

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const x = Math.round(n);
  return Math.max(0, Math.min(MAX_PAIR_COEFF, x));
}

function gapMsIfNonOverlapping(a: CandidateSlot, b: CandidateSlot): number | null {
  if (a.day !== b.day) return null;
  const aEnd = a.endTime.getTime();
  const bEnd = b.endTime.getTime();
  const aStart = a.startTime.getTime();
  const bStart = b.startTime.getTime();
  if (candidateIntervalsOverlap(a, b)) return null;
  if (aEnd <= bStart) return bStart - aEnd;
  if (bEnd <= aStart) return aStart - bEnd;
  return null;
}

function gapMinutesFromMs(ms: number): number {
  return ms / 60000;
}

type PairwiseKey = string;

function keyPair(i: number, k: number, j: number, l: number): PairwiseKey {
  return `${i}\0${k}\0${j}\0${l}`;
}

/**
 * Build integer linear + pairwise costs for POST /solve-optimize.
 * Pairwise terms use auxiliary z with task indices i < j.
 */
export function buildSoftObjectiveInputs(params: {
  tasks: PlacementTask[];
  candidatesByTask: CandidateSlot[][];
  weights?: SoftGoalWeights;
}): {
  linearCost: number[][];
  pairwiseTerms: Array<{ i: number; k: number; j: number; l: number; coeff: number }>;
} {
  const weights = params.weights ?? DEFAULT_SOFT_WEIGHTS;
  const { tasks, candidatesByTask } = params;
  const n = tasks.length;

  const linearCost: number[][] = tasks.map((_, i) =>
    (candidatesByTask[i] ?? []).map(() => 0)
  );

  const merged = new Map<PairwiseKey, number>();

  const addPair = (i: number, k: number, j: number, l: number, add: number) => {
    if (i >= j) return;
    if (add <= 0) return;
    const kk = keyPair(i, k, j, l);
    merged.set(kk, (merged.get(kk) ?? 0) + add);
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ti = tasks[i]!;
      const tj = tasks[j]!;
      const ci = candidatesByTask[i];
      const cj = candidatesByTask[j];
      if (!ci?.length || !cj?.length) continue;

      // SG2: same requirement row → penalize same day (spread across week)
      if (ti.requirementIndex === tj.requirementIndex && ti.classId === tj.classId) {
        for (let k = 0; k < ci.length; k++) {
          for (let l = 0; l < cj.length; l++) {
            if (ci[k]!.day === cj[l]!.day) {
              addPair(i, k, j, l, clampInt(weights.sg2 * SCALE));
            }
          }
        }
      }

      for (let k = 0; k < ci.length; k++) {
        for (let l = 0; l < cj.length; l++) {
          const si = ci[k]!;
          const sj = cj[l]!;
          if (si.day !== sj.day) continue;

          // SG3: different fixed rooms for the same class (proxy for room churn)
          if (ti.classId === tj.classId) {
            const ri = ti.roomId;
            const rj = tj.roomId;
            if (ri != null && rj != null && ri !== rj) {
              addPair(i, k, j, l, clampInt(weights.sg3 * SCALE));
            }
          }

          const gapMs = gapMsIfNonOverlapping(si, sj);
          if (gapMs == null) continue;
          const gapMin = gapMinutesFromMs(gapMs);
          const gapPart = clampInt((gapMin * SCALE) / GAP_DIVISOR);

          if (ti.teacherId === tj.teacherId) {
            addPair(i, k, j, l, clampInt(weights.sg1 * gapPart));
          }
          if (ti.classId === tj.classId) {
            addPair(i, k, j, l, clampInt(weights.sg4 * gapPart));
          }
        }
      }
    }
  }

  const pairwiseTerms: Array<{ i: number; k: number; j: number; l: number; coeff: number }> = [];
  for (const [key, coeff] of Array.from(merged.entries())) {
    if (coeff <= 0) continue;
    const [si, sk, sj, sl] = key.split("\0");
    pairwiseTerms.push({
      i: Number(si),
      k: Number(sk),
      j: Number(sj),
      l: Number(sl),
      coeff: clampInt(coeff),
    });
  }

  pairwiseTerms.sort((a, b) => a.i - b.i || a.j - b.j || a.k - b.k || a.l - b.l);

  return { linearCost, pairwiseTerms };
}
