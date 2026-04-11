/**
 * Greedy weekly timetable assistant (MVP + school-scoped): places lesson templates into Mon–Fri × bell periods.
 * See docs/timetable/TIMETABLE_ASSISTANT_MVP.md, docs/timetable/TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md, docs/scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md §8.
 */

import { Day, LessonDeliveryMode } from "@prisma/client";
import { computeLessonTimesFromPeriodSpan, periodIntervalsOverlap } from "@/lib/domain/bellPeriodRules";
import {
  lessonOverlapsTeacherUnavailable,
  type TeacherUnavailableRow,
} from "@/lib/domain/timetableTeacherAvailability";

export type { TeacherUnavailableRow };

/** Mon–Fri only for school weekly grid. */
export const TIMETABLE_WEEKDAYS: Day[] = [
  Day.MONDAY,
  Day.TUESDAY,
  Day.WEDNESDAY,
  Day.THURSDAY,
  Day.FRIDAY,
];

export type PeriodInput = {
  id: string;
  name: string;
  order: number;
  startTime: Date;
  endTime: Date;
};

export type TimetableRequirementRow = {
  subjectId: number;
  teacherId: string;
  /** Number of blocks per week for this row (each block spans `blockSize` consecutive periods). */
  periodsPerWeek: number;
  /** Consecutive bell periods in one block; 1 = single period (default). */
  blockSize?: number;
  roomId: number | null;
  /** Defaults to IN_PERSON when omitted (matrix / legacy payloads). */
  deliveryMode?: LessonDeliveryMode;
  meetingUrl?: string | null;
  meetingLabel?: string | null;
};

/** Whole-school / multi-class requirement: one row per (class, subject, teacher, …). */
export type SchoolRequirementRow = TimetableRequirementRow & { classId: number };

/** A lesson already in the DB (or merged from another proposal pass) used for conflict checks. */
export type ExistingSlot = {
  id?: number;
  day: Day;
  startTime: Date;
  endTime: Date;
  teacherId: string;
  classId: number;
  roomId: number | null;
};

export type PlacementTask = {
  requirementIndex: number;
  subjectId: number;
  teacherId: string;
  classId: number;
  roomId: number | null;
  deliveryMode: LessonDeliveryMode;
  meetingUrl: string | null;
  meetingLabel: string | null;
  /** Consecutive periods in this placement (from requirement row). */
  blockSize: number;
  /** Which copy within the row (0 .. periodsPerWeek-1). */
  slotIndex: number;
};

/** In-person row with no meeting link — useful for tests and manual task literals. */
export const inPersonPlacementExtras: Pick<
  PlacementTask,
  "deliveryMode" | "meetingUrl" | "meetingLabel"
> = {
  deliveryMode: LessonDeliveryMode.IN_PERSON,
  meetingUrl: null,
  meetingLabel: null,
};

export type TimetableProposal = {
  requirementIndex: number;
  slotIndex: number;
  day: Day;
  periodId: string;
  /** Null when single-period block (`blockSize` 1). */
  endPeriodId: string | null;
  periodName: string;
  startTime: Date;
  endTime: Date;
  subjectId: number;
  teacherId: string;
  classId: number;
  roomId: number | null;
  deliveryMode: LessonDeliveryMode;
  meetingUrl: string | null;
  meetingLabel: string | null;
  name: string;
};

export type UnplacedTask = PlacementTask & {
  reason: "NO_SLOT" | "CAPACITY";
};

export type TimetablePreviewResult = {
  proposals: TimetableProposal[];
  unplaced: UnplacedTask[];
  /** Number of placement tasks (blocks per week). */
  totalRequiredSlots: number;
  /**
   * Max single-period grid units per class per week (5 days × period count).
   * Compare to weighted demand: sum of periodsPerWeek × blockSize per class.
   */
  totalAvailableSlots: number;
};

export function anchorForWeekday(day: Day): Date {
  const baseMonday = new Date(2024, 0, 1);
  const offset: Record<Day, number> = {
    [Day.MONDAY]: 0,
    [Day.TUESDAY]: 1,
    [Day.WEDNESDAY]: 2,
    [Day.THURSDAY]: 3,
    [Day.FRIDAY]: 4,
    [Day.SATURDAY]: 5,
    [Day.SUNDAY]: 6,
  };
  const d = new Date(baseMonday);
  d.setDate(d.getDate() + offset[day]);
  return d;
}

/** Sort periods by order, then name (same as greedy preview). */
export function sortPeriodsForTimetable(periods: PeriodInput[]): PeriodInput[] {
  return [...periods].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * All ways to place a block of `blockSize` consecutive periods (by `order`, no gaps).
 */
export function listContiguousPeriodSpans(
  sortedPeriods: PeriodInput[],
  blockSize: number
): Array<{ startPeriod: PeriodInput; endPeriod: PeriodInput }> {
  const sorted = sortPeriodsForTimetable(sortedPeriods);
  const out: Array<{ startPeriod: PeriodInput; endPeriod: PeriodInput }> = [];
  if (blockSize < 1 || sorted.length === 0) return out;
  for (let i = 0; i + blockSize <= sorted.length; i++) {
    const slice = sorted.slice(i, i + blockSize);
    let ok = true;
    for (let j = 0; j < blockSize - 1; j++) {
      if (slice[j + 1]!.order !== slice[j]!.order + 1) {
        ok = false;
        break;
      }
    }
    if (ok) {
      out.push({ startPeriod: slice[0]!, endPeriod: slice[blockSize - 1]! });
    }
  }
  return out;
}

/** Longest contiguous run of period `order` values (for max valid block size). */
export function maxContiguousBlockSize(sortedPeriods: PeriodInput[]): number {
  const sorted = sortPeriodsForTimetable(sortedPeriods);
  if (sorted.length === 0) return 0;
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.order === sorted[i - 1]!.order + 1) {
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 1;
    }
  }
  return maxRun;
}

export function effectiveBlockSize(row: TimetableRequirementRow): number {
  return Math.max(1, Math.floor(row.blockSize ?? 1));
}

/** Weighted grid units: sum of periodsPerWeek × blockSize per row (single-class). */
export function weightedDemandForRequirements(requirements: TimetableRequirementRow[]): number {
  return requirements.reduce(
    (acc, r) => acc + Math.max(0, Math.floor(r.periodsPerWeek)) * effectiveBlockSize(r),
    0
  );
}

/** Two template intervals on the same conceptual weekday overlap (time-of-day). */
export function slotsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return periodIntervalsOverlap(aStart, aEnd, bStart, bEnd);
}

/** True if proposed slot conflicts with teacher, class, or room occupancy. */
export function conflictsWithOccupancy(
  day: Day,
  start: Date,
  end: Date,
  teacherId: string,
  classId: number,
  roomId: number | null,
  occupancy: ExistingSlot[]
): boolean {
  for (const o of occupancy) {
    if (o.day !== day) continue;
    if (!slotsOverlap(start, end, o.startTime, o.endTime)) continue;
    if (o.teacherId === teacherId) return true;
    if (o.classId === classId) return true;
    if (roomId != null && o.roomId != null && o.roomId === roomId) return true;
  }
  return false;
}

/**
 * Greedy placement loop shared by single-class and school-wide preview.
 */
export function runGreedyPlacement(params: {
  sortedPeriods: PeriodInput[];
  tasks: PlacementTask[];
  subjectNameById: Map<number, string>;
  classNameById: Map<number, string>;
  existing: ExistingSlot[];
  /** When set, skip slots overlapping teacher unavailability (parity with commit). */
  teacherUnavailableByTeacherId?: Map<string, TeacherUnavailableRow[]>;
}): { proposals: TimetableProposal[]; unplacedNoSlot: UnplacedTask[] } {
  const {
    sortedPeriods,
    tasks,
    subjectNameById,
    classNameById,
    existing,
    teacherUnavailableByTeacherId = new Map(),
  } = params;
  const occupancy: ExistingSlot[] = existing.map((e) => ({ ...e }));
  const proposals: TimetableProposal[] = [];
  const unplacedNoSlot: UnplacedTask[] = [];

  for (const task of tasks) {
    const bs = Math.max(1, task.blockSize);
    const spans = listContiguousPeriodSpans(sortedPeriods, bs);
    if (spans.length === 0) {
      unplacedNoSlot.push({ ...task, reason: "NO_SLOT" });
      continue;
    }

    let placed = false;
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
          conflictsWithOccupancy(day, startTime, endTime, task.teacherId, task.classId, task.roomId, occupancy)
        ) {
          continue;
        }
        const subjectName = subjectNameById.get(task.subjectId) ?? `Subject ${task.subjectId}`;
        const cname = classNameById.get(task.classId) ?? `Class ${task.classId}`;
        const name = `${subjectName} — ${cname}`;
        const periodName =
          bs <= 1 || startPeriod.id === endPeriod.id
            ? startPeriod.name
            : `${startPeriod.name}–${endPeriod.name}`;
        proposals.push({
          requirementIndex: task.requirementIndex,
          slotIndex: task.slotIndex,
          day,
          periodId: startPeriod.id,
          endPeriodId: bs <= 1 || startPeriod.id === endPeriod.id ? null : endPeriod.id,
          periodName,
          startTime,
          endTime,
          subjectId: task.subjectId,
          teacherId: task.teacherId,
          classId: task.classId,
          roomId: task.roomId,
          deliveryMode: task.deliveryMode,
          meetingUrl: task.meetingUrl,
          meetingLabel: task.meetingLabel,
          name,
        });
        occupancy.push({
          day,
          startTime,
          endTime,
          teacherId: task.teacherId,
          classId: task.classId,
          roomId: task.roomId,
        });
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) {
      unplacedNoSlot.push({ ...task, reason: "NO_SLOT" });
    }
  }

  return { proposals, unplacedNoSlot };
}

/**
 * Expand requirement rows into atomic placement tasks (one per period per week).
 */
export function expandRequirementsToTasks(
  requirements: TimetableRequirementRow[],
  classId: number
): PlacementTask[] {
  const tasks: PlacementTask[] = [];
  requirements.forEach((row, requirementIndex) => {
    const n = Math.max(0, Math.floor(row.periodsPerWeek));
    const blockSize = effectiveBlockSize(row);
    const dm = row.deliveryMode ?? LessonDeliveryMode.IN_PERSON;
    const online = dm === LessonDeliveryMode.ONLINE;
    for (let slotIndex = 0; slotIndex < n; slotIndex++) {
      tasks.push({
        requirementIndex,
        subjectId: row.subjectId,
        teacherId: row.teacherId,
        classId,
        roomId: online ? null : row.roomId ?? null,
        deliveryMode: dm,
        meetingUrl: online ? row.meetingUrl ?? null : null,
        meetingLabel: online ? row.meetingLabel ?? null : null,
        blockSize,
        slotIndex,
      });
    }
  });
  return tasks;
}

/** Expand flat school requirements; `requirementIndex` is the index in the requirements array. */
export function expandSchoolRequirementsToTasks(requirements: SchoolRequirementRow[]): PlacementTask[] {
  const tasks: PlacementTask[] = [];
  requirements.forEach((row, requirementIndex) => {
    const n = Math.max(0, Math.floor(row.periodsPerWeek));
    const blockSize = effectiveBlockSize(row);
    const dm = row.deliveryMode ?? LessonDeliveryMode.IN_PERSON;
    const online = dm === LessonDeliveryMode.ONLINE;
    for (let slotIndex = 0; slotIndex < n; slotIndex++) {
      tasks.push({
        requirementIndex,
        subjectId: row.subjectId,
        teacherId: row.teacherId,
        classId: row.classId,
        roomId: online ? null : row.roomId ?? null,
        deliveryMode: dm,
        meetingUrl: online ? row.meetingUrl ?? null : null,
        meetingLabel: online ? row.meetingLabel ?? null : null,
        blockSize,
        slotIndex,
      });
    }
  });
  return tasks;
}

export function sortTasksByClassOrder(tasks: PlacementTask[], classOrder: number[]): PlacementTask[] {
  const rank = new Map(classOrder.map((id, i) => [id, i]));
  return [...tasks].sort((a, b) => {
    const ra = rank.get(a.classId) ?? 99999;
    const rb = rank.get(b.classId) ?? 99999;
    if (ra !== rb) return ra - rb;
    if (a.requirementIndex !== b.requirementIndex) return a.requirementIndex - b.requirementIndex;
    return a.slotIndex - b.slotIndex;
  });
}

export type ComputePreviewParams = {
  periods: PeriodInput[];
  requirements: TimetableRequirementRow[];
  classId: number;
  subjectNameById: Map<number, string>;
  className: string;
  existing: ExistingSlot[];
  teacherUnavailableByTeacherId?: Map<string, TeacherUnavailableRow[]>;
};

/**
 * Single-class greedy placement.
 */
export function computeTimetablePreview(params: ComputePreviewParams): TimetablePreviewResult {
  const {
    periods,
    requirements,
    classId,
    subjectNameById,
    className,
    existing,
    teacherUnavailableByTeacherId,
  } = params;

  const sortedPeriods = sortPeriodsForTimetable(periods);
  const maxPerClassWeek = TIMETABLE_WEEKDAYS.length * sortedPeriods.length;
  const allTasks = expandRequirementsToTasks(requirements, classId);
  const totalRequiredSlots = allTasks.length;
  const weightedDemand = weightedDemandForRequirements(requirements);
  const maxK = maxContiguousBlockSize(sortedPeriods);

  if (sortedPeriods.length === 0) {
    return {
      proposals: [],
      unplaced: allTasks.map((t) => ({ ...t, reason: "CAPACITY" as const })),
      totalRequiredSlots,
      totalAvailableSlots: 0,
    };
  }

  if (weightedDemand > maxPerClassWeek) {
    return {
      proposals: [],
      unplaced: allTasks.map((t) => ({ ...t, reason: "CAPACITY" as const })),
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

  const classNameById = new Map<number, string>([[classId, className]]);
  const { proposals, unplacedNoSlot } = runGreedyPlacement({
    sortedPeriods,
    tasks: validTasks,
    subjectNameById,
    classNameById,
    existing,
    teacherUnavailableByTeacherId,
  });

  return {
    proposals,
    unplaced: [...capacityUnplaced, ...unplacedNoSlot],
    totalRequiredSlots,
    totalAvailableSlots: maxPerClassWeek,
  };
}

export type ComputeSchoolPreviewParams = {
  periods: PeriodInput[];
  requirements: SchoolRequirementRow[];
  /** Deterministic class ordering (e.g. grade then name); used to sort placement tasks. */
  classOrder: number[];
  subjectNameById: Map<number, string>;
  classNameById: Map<number, string>;
  existing: ExistingSlot[];
  teacherUnavailableByTeacherId?: Map<string, TeacherUnavailableRow[]>;
};

/**
 * Multi-class / school-wide greedy: global occupancy, per-class weekly capacity `5 × numPeriods`.
 */
export function computeTimetablePreviewSchool(params: ComputeSchoolPreviewParams): TimetablePreviewResult {
  const {
    periods,
    requirements,
    classOrder,
    subjectNameById,
    classNameById,
    existing,
    teacherUnavailableByTeacherId,
  } = params;

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
      proposals: [],
      unplaced: allTasks.map((t) => ({ ...t, reason: "CAPACITY" as const })),
      totalRequiredSlots: allTasks.length,
      totalAvailableSlots: 0,
    };
  }

  const { proposals, unplacedNoSlot } = runGreedyPlacement({
    sortedPeriods,
    tasks: orderedTasks,
    subjectNameById,
    classNameById,
    existing,
    teacherUnavailableByTeacherId,
  });

  return {
    proposals,
    unplaced: [...capacityUnplaced, ...unplacedNoSlot],
    totalRequiredSlots: allTasks.length,
    totalAvailableSlots: maxPerClassWeek,
  };
}
