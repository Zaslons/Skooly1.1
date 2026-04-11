/**
 * CP-SAT feasibility support: enumerate per-task candidate slots and build pairwise conflict edges.
 * See docs/timetable/TIMETABLE_SOLVER_PHASE_F_DESIGN.md §4, docs/timetable/TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md.
 */

import { Day } from "@prisma/client";
import { computeLessonTimesFromPeriodSpan } from "@/lib/domain/bellPeriodRules";
import {
  anchorForWeekday,
  conflictsWithOccupancy,
  effectiveBlockSize,
  expandRequirementsToTasks,
  expandSchoolRequirementsToTasks,
  listContiguousPeriodSpans,
  maxContiguousBlockSize,
  sortPeriodsForTimetable,
  sortTasksByClassOrder,
  slotsOverlap,
  TIMETABLE_WEEKDAYS,
  weightedDemandForRequirements,
  type ExistingSlot,
  type PeriodInput,
  type PlacementTask,
  type SchoolRequirementRow,
  type TimetableRequirementRow,
  type UnplacedTask,
} from "@/lib/domain/timetableAssistant";
import {
  lessonOverlapsTeacherUnavailable,
  type TeacherUnavailableRow,
} from "@/lib/domain/timetableTeacherAvailability";

export type CandidateSlot = {
  day: Day;
  startPeriodId: string;
  endPeriodId: string | null;
  /** Display label (matches greedy `periodName`). */
  periodName: string;
  startTime: Date;
  endTime: Date;
};

/** Same ordering as greedy: Mon–Fri, then contiguous spans in period order. */
export function enumerateCandidatesForTask(
  task: PlacementTask,
  sortedPeriods: PeriodInput[],
  existing: ExistingSlot[],
  teacherUnavailableByTeacherId: Map<string, TeacherUnavailableRow[]>
): CandidateSlot[] {
  const bs = Math.max(1, task.blockSize);
  const spans = listContiguousPeriodSpans(sortedPeriods, bs);
  const out: CandidateSlot[] = [];
  for (const day of TIMETABLE_WEEKDAYS) {
    const anchor = anchorForWeekday(day);
    for (const { startPeriod, endPeriod } of spans) {
      const { startTime, endTime } = computeLessonTimesFromPeriodSpan(anchor, startPeriod, endPeriod);
      if (
        lessonOverlapsTeacherUnavailable(
          day,
          startTime,
          endTime,
          task.teacherId,
          teacherUnavailableByTeacherId
        )
      ) {
        continue;
      }
      if (
        conflictsWithOccupancy(day, startTime, endTime, task.teacherId, task.classId, task.roomId, existing)
      ) {
        continue;
      }
      const endPeriodId = bs <= 1 || startPeriod.id === endPeriod.id ? null : endPeriod.id;
      const periodName =
        bs <= 1 || startPeriod.id === endPeriod.id
          ? startPeriod.name
          : `${startPeriod.name}–${endPeriod.name}`;
      out.push({
        day,
        startPeriodId: startPeriod.id,
        endPeriodId: endPeriodId,
        periodName,
        startTime,
        endTime,
      });
    }
  }
  return out;
}

/** True if two tasks can ever share a resource that forbids overlap. */
export function tasksCanShareConflictResource(a: PlacementTask, b: PlacementTask): boolean {
  if (a.teacherId === b.teacherId) return true;
  if (a.classId === b.classId) return true;
  if (a.roomId != null && b.roomId != null && a.roomId === b.roomId) return true;
  return false;
}

export function candidateIntervalsOverlap(a: CandidateSlot, b: CandidateSlot): boolean {
  if (a.day !== b.day) return false;
  return slotsOverlap(a.startTime, a.endTime, b.startTime, b.endTime);
}

/**
 * Conflict edges for CP-SAT: [task_i, cand_i, task_j, cand_j] with i < j meaning
 * choosing candidate cand_i for task i and cand_j for task j is forbidden.
 */
export function buildConflictPairs(
  tasks: PlacementTask[],
  candidatesByTask: CandidateSlot[][]
): [number, number, number, number][] {
  const conflicts: [number, number, number, number][] = [];
  const n = tasks.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!tasksCanShareConflictResource(tasks[i]!, tasks[j]!)) continue;
      const ci = candidatesByTask[i];
      const cj = candidatesByTask[j];
      if (!ci?.length || !cj?.length) continue;
      for (let k = 0; k < ci.length; k++) {
        for (let l = 0; l < cj.length; l++) {
          if (candidateIntervalsOverlap(ci[k]!, cj[l]!)) {
            conflicts.push([i, k, j, l]);
          }
        }
      }
    }
  }
  return conflicts;
}

export function partitionSingleClassForSolver(params: {
  periods: PeriodInput[];
  requirements: TimetableRequirementRow[];
  classId: number;
}): {
  sortedPeriods: PeriodInput[];
  capacityUnplaced: UnplacedTask[];
  validTasks: PlacementTask[];
  totalRequiredSlots: number;
  totalAvailableSlots: number;
} {
  const { periods, requirements, classId } = params;
  const sortedPeriods = sortPeriodsForTimetable(periods);
  const maxPerClassWeek = TIMETABLE_WEEKDAYS.length * sortedPeriods.length;
  const allTasks = expandRequirementsToTasks(requirements, classId);
  const totalRequiredSlots = allTasks.length;
  const weightedDemand = weightedDemandForRequirements(requirements);
  const maxK = maxContiguousBlockSize(sortedPeriods);

  if (sortedPeriods.length === 0) {
    return {
      sortedPeriods,
      capacityUnplaced: allTasks.map((t) => ({ ...t, reason: "CAPACITY" as const })),
      validTasks: [],
      totalRequiredSlots,
      totalAvailableSlots: 0,
    };
  }

  if (weightedDemand > maxPerClassWeek) {
    return {
      sortedPeriods,
      capacityUnplaced: allTasks.map((t) => ({ ...t, reason: "CAPACITY" as const })),
      validTasks: [],
      totalRequiredSlots,
      totalAvailableSlots: maxPerClassWeek,
    };
  }

  const capacityUnplaced: UnplacedTask[] = [];
  const validTasks: PlacementTask[] = [];
  for (const t of allTasks) {
    if (t.blockSize > maxK) {
      capacityUnplaced.push({ ...t, reason: "CAPACITY" });
    } else {
      validTasks.push(t);
    }
  }

  return {
    sortedPeriods,
    capacityUnplaced,
    validTasks,
    totalRequiredSlots,
    totalAvailableSlots: maxPerClassWeek,
  };
}

export function partitionSchoolForSolver(params: {
  periods: PeriodInput[];
  requirements: SchoolRequirementRow[];
  classOrder: number[];
}): {
  sortedPeriods: PeriodInput[];
  capacityUnplaced: UnplacedTask[];
  validTasks: PlacementTask[];
  totalRequiredSlots: number;
  totalAvailableSlots: number;
} {
  const { periods, requirements, classOrder } = params;
  const sortedPeriods = sortPeriodsForTimetable(periods);
  const maxPerClassWeek = TIMETABLE_WEEKDAYS.length * sortedPeriods.length;
  const allTasks = expandSchoolRequirementsToTasks(requirements);
  const maxK = maxContiguousBlockSize(sortedPeriods);

  const sumPeriodsByClass = new Map<number, number>();
  for (const row of requirements) {
    const add = Math.max(0, Math.floor(row.periodsPerWeek)) * effectiveBlockSize(row);
    sumPeriodsByClass.set(row.classId, (sumPeriodsByClass.get(row.classId) ?? 0) + add);
  }

  const overCapClasses = new Set<number>();
  for (const [cid, sum] of Array.from(sumPeriodsByClass.entries())) {
    if (sum > maxPerClassWeek) overCapClasses.add(cid);
  }

  const capacityUnplaced: UnplacedTask[] = [];
  const validTasks: PlacementTask[] = [];
  for (const t of allTasks) {
    if (overCapClasses.has(t.classId)) {
      capacityUnplaced.push({ ...t, reason: "CAPACITY" });
    } else if (t.blockSize > maxK) {
      capacityUnplaced.push({ ...t, reason: "CAPACITY" });
    } else {
      validTasks.push(t);
    }
  }

  const orderedTasks = sortTasksByClassOrder(validTasks, classOrder);

  if (sortedPeriods.length === 0) {
    return {
      sortedPeriods,
      capacityUnplaced: allTasks.map((t) => ({ ...t, reason: "CAPACITY" as const })),
      validTasks: [],
      totalRequiredSlots: allTasks.length,
      totalAvailableSlots: 0,
    };
  }

  return {
    sortedPeriods,
    capacityUnplaced,
    validTasks: orderedTasks,
    totalRequiredSlots: allTasks.length,
    totalAvailableSlots: maxPerClassWeek,
  };
}
