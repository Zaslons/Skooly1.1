/**
 * HTTP client + mapping for CP-SAT feasibility solver (Python FastAPI).
 * See services/timetable-solver/, docs/timetable/TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md
 */

import type {
  ExistingSlot,
  PeriodInput,
  PlacementTask,
  TimetableProposal,
} from "@/lib/domain/timetableAssistant";
import {
  buildConflictPairs,
  enumerateCandidatesForTask,
  type CandidateSlot,
} from "@/lib/domain/timetableFeasibility";
import { buildSoftObjectiveInputs } from "@/lib/domain/timetableSoftGoals";
import type { TeacherUnavailableRow } from "@/lib/domain/timetableTeacherAvailability";

export const TIMETABLE_SOLVER_MAX_TASKS = 300;
export const TIMETABLE_SOLVER_TIMEOUT_MS = 30_000;

export type FeasibilitySolverRequestJson = {
  schemaVersion: 1;
  timeLimitSeconds: number;
  numTasks: number;
  candidatesPerTask: number[];
  conflicts: number[][];
};

export type OptimizeSolverRequestJson = {
  schemaVersion: 2;
  timeLimitSeconds: number;
  numTasks: number;
  candidatesPerTask: number[];
  conflicts: number[][];
  linearCost: number[][];
  pairwiseTerms: Array<{ i: number; k: number; j: number; l: number; coeff: number }>;
};

export type FeasibilitySolverErrorCode =
  | "NO_CANDIDATES"
  | "INFEASIBLE"
  | "SOLVER_TIMEOUT"
  | "SOLVER_INVALID"
  | "SOLVER_UNAVAILABLE";

export function proposalsFromSolverChoice(params: {
  tasks: PlacementTask[];
  candidatesByTask: CandidateSlot[][];
  choice: number[];
  subjectNameById: Map<number, string>;
  classNameById: Map<number, string>;
}): TimetableProposal[] {
  const { tasks, candidatesByTask, choice, subjectNameById, classNameById } = params;
  const proposals: TimetableProposal[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    const k = choice[i];
    if (k === undefined || !Number.isInteger(k)) {
      throw new Error("Invalid solver choice index.");
    }
    const taskSlots = candidatesByTask[i];
    const slot = taskSlots?.[k];
    if (!slot) {
      throw new Error("Solver choice out of range for task " + i);
    }
    const subjectName = subjectNameById.get(task.subjectId) ?? `Subject ${task.subjectId}`;
    const cname = classNameById.get(task.classId) ?? `Class ${task.classId}`;
    const name = `${subjectName} — ${cname}`;
    proposals.push({
      requirementIndex: task.requirementIndex,
      slotIndex: task.slotIndex,
      day: slot.day,
      periodId: slot.startPeriodId,
      endPeriodId: slot.endPeriodId,
      periodName: slot.periodName,
      startTime: slot.startTime,
      endTime: slot.endTime,
      subjectId: task.subjectId,
      teacherId: task.teacherId,
      classId: task.classId,
      roomId: task.roomId,
      deliveryMode: task.deliveryMode,
      meetingUrl: task.meetingUrl,
      meetingLabel: task.meetingLabel,
      name,
    });
  }
  return proposals;
}

export async function runCpSatFeasibilityPlacement(params: {
  tasks: PlacementTask[];
  sortedPeriods: PeriodInput[];
  existing: ExistingSlot[];
  teacherUnavailableByTeacherId: Map<string, TeacherUnavailableRow[]>;
  subjectNameById: Map<number, string>;
  classNameById: Map<number, string>;
  solverBaseUrl: string;
  solverSecret: string;
  /** @default TIMETABLE_SOLVER_TIMEOUT_MS */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; proposals: TimetableProposal[]; candidatesByTask: CandidateSlot[][] }
  | { ok: false; code: FeasibilitySolverErrorCode; error?: string }
> {
  const {
    tasks,
    sortedPeriods,
    existing,
    teacherUnavailableByTeacherId,
    subjectNameById,
    classNameById,
    solverBaseUrl,
    solverSecret,
    timeoutMs = TIMETABLE_SOLVER_TIMEOUT_MS,
    fetchImpl = fetch,
  } = params;

  if (tasks.length > TIMETABLE_SOLVER_MAX_TASKS) {
    return { ok: false, code: "SOLVER_INVALID", error: "Too many tasks." };
  }

  const candidatesByTask = tasks.map((t) =>
    enumerateCandidatesForTask(t, sortedPeriods, existing, teacherUnavailableByTeacherId)
  );

  if (candidatesByTask.some((c) => c.length === 0)) {
    return { ok: false, code: "NO_CANDIDATES" };
  }

  const conflicts = buildConflictPairs(tasks, candidatesByTask);
  const body: FeasibilitySolverRequestJson = {
    schemaVersion: 1,
    timeLimitSeconds: Math.min(30, timeoutMs / 1000),
    numTasks: tasks.length,
    candidatesPerTask: candidatesByTask.map((c) => c.length),
    conflicts: conflicts.map((row) => [...row]),
  };

  const url = `${solverBaseUrl.replace(/\/$/, "")}/solve-feasibility`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${solverSecret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, code: "SOLVER_TIMEOUT", error: msg };
    }
    return { ok: false, code: "SOLVER_UNAVAILABLE", error: msg };
  } finally {
    clearTimeout(timer);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, code: "SOLVER_UNAVAILABLE", error: "Invalid JSON from solver." };
  }

  if (!res.ok) {
    return {
      ok: false,
      code: "SOLVER_UNAVAILABLE",
      error: `Solver HTTP ${res.status}`,
    };
  }

  const parsed = json as { ok?: boolean; choice?: number[]; reason?: string };
  if (parsed.ok === true && Array.isArray(parsed.choice) && parsed.choice.length === tasks.length) {
    for (let i = 0; i < tasks.length; i++) {
      const k = parsed.choice[i];
      const ki = candidatesByTask[i]?.length ?? 0;
      if (!Number.isInteger(k) || k < 0 || k >= ki) {
        return { ok: false, code: "SOLVER_INVALID" };
      }
    }
    const proposals = proposalsFromSolverChoice({
      tasks,
      candidatesByTask,
      choice: parsed.choice,
      subjectNameById,
      classNameById,
    });
    return { ok: true, proposals, candidatesByTask };
  }

  if (parsed.ok === false) {
    if (parsed.reason === "INFEASIBLE") return { ok: false, code: "INFEASIBLE" };
    if (parsed.reason === "TIMEOUT") return { ok: false, code: "SOLVER_TIMEOUT" };
    return { ok: false, code: "SOLVER_INVALID" };
  }

  return { ok: false, code: "SOLVER_INVALID" };
}

function roundNonNegativeInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** CP-SAT with soft goals (Phase F.3). POST /solve-optimize. */
export async function runCpSatOptimizePlacement(params: {
  tasks: PlacementTask[];
  sortedPeriods: PeriodInput[];
  existing: ExistingSlot[];
  teacherUnavailableByTeacherId: Map<string, TeacherUnavailableRow[]>;
  subjectNameById: Map<number, string>;
  classNameById: Map<number, string>;
  solverBaseUrl: string;
  solverSecret: string;
  /** @default TIMETABLE_SOLVER_TIMEOUT_MS */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; proposals: TimetableProposal[]; candidatesByTask: CandidateSlot[][] }
  | { ok: false; code: FeasibilitySolverErrorCode; error?: string }
> {
  const {
    tasks,
    sortedPeriods,
    existing,
    teacherUnavailableByTeacherId,
    subjectNameById,
    classNameById,
    solverBaseUrl,
    solverSecret,
    timeoutMs = TIMETABLE_SOLVER_TIMEOUT_MS,
    fetchImpl = fetch,
  } = params;

  if (tasks.length > TIMETABLE_SOLVER_MAX_TASKS) {
    return { ok: false, code: "SOLVER_INVALID", error: "Too many tasks." };
  }

  const candidatesByTask = tasks.map((t) =>
    enumerateCandidatesForTask(t, sortedPeriods, existing, teacherUnavailableByTeacherId)
  );

  if (candidatesByTask.some((c) => c.length === 0)) {
    return { ok: false, code: "NO_CANDIDATES" };
  }

  const conflicts = buildConflictPairs(tasks, candidatesByTask);
  const soft = buildSoftObjectiveInputs({ tasks, candidatesByTask });
  const linearCost = soft.linearCost.map((row) => row.map((c) => roundNonNegativeInt(c)));
  const pairwiseTerms = soft.pairwiseTerms.map((t) => ({
    i: t.i,
    k: t.k,
    j: t.j,
    l: t.l,
    coeff: roundNonNegativeInt(t.coeff),
  }));

  const body: OptimizeSolverRequestJson = {
    schemaVersion: 2,
    timeLimitSeconds: Math.min(30, timeoutMs / 1000),
    numTasks: tasks.length,
    candidatesPerTask: candidatesByTask.map((c) => c.length),
    conflicts: conflicts.map((row) => [...row]),
    linearCost,
    pairwiseTerms,
  };

  const url = `${solverBaseUrl.replace(/\/$/, "")}/solve-optimize`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${solverSecret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, code: "SOLVER_TIMEOUT", error: msg };
    }
    return { ok: false, code: "SOLVER_UNAVAILABLE", error: msg };
  } finally {
    clearTimeout(timer);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, code: "SOLVER_UNAVAILABLE", error: "Invalid JSON from solver." };
  }

  if (!res.ok) {
    return {
      ok: false,
      code: "SOLVER_UNAVAILABLE",
      error: `Solver HTTP ${res.status}`,
    };
  }

  const parsed = json as { ok?: boolean; choice?: number[]; reason?: string };
  if (parsed.ok === true && Array.isArray(parsed.choice) && parsed.choice.length === tasks.length) {
    for (let i = 0; i < tasks.length; i++) {
      const k = parsed.choice[i];
      const ki = candidatesByTask[i]?.length ?? 0;
      if (!Number.isInteger(k) || k < 0 || k >= ki) {
        return { ok: false, code: "SOLVER_INVALID" };
      }
    }
    const proposals = proposalsFromSolverChoice({
      tasks,
      candidatesByTask,
      choice: parsed.choice,
      subjectNameById,
      classNameById,
    });
    return { ok: true, proposals, candidatesByTask };
  }

  if (parsed.ok === false) {
    if (parsed.reason === "INFEASIBLE") return { ok: false, code: "INFEASIBLE" };
    if (parsed.reason === "TIMEOUT") return { ok: false, code: "SOLVER_TIMEOUT" };
    return { ok: false, code: "SOLVER_INVALID" };
  }

  return { ok: false, code: "SOLVER_INVALID" };
}
