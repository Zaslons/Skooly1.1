import { describe, expect, it } from "vitest";
import { Day } from "@prisma/client";
import {
  buildConflictPairs,
  candidateIntervalsOverlap,
  enumerateCandidatesForTask,
  partitionSingleClassForSolver,
  tasksCanShareConflictResource,
} from "@/lib/domain/timetableFeasibility";
import { inPersonPlacementExtras, type PlacementTask } from "@/lib/domain/timetableAssistant";

const p = (id: string, order: number, startH: number, endH: number) => ({
  id,
  name: `P${order}`,
  order,
  startTime: new Date(2024, 0, 1, startH, 0, 0, 0),
  endTime: new Date(2024, 0, 1, endH, 0, 0, 0),
});

describe("timetableFeasibility", () => {
  it("enumerateCandidatesForTask excludes Monday when teacher unavailable all day", () => {
    const periods = [p("a", 1, 8, 9)];
    const task: PlacementTask = {
      requirementIndex: 0,
      subjectId: 1,
      teacherId: "t1",
      classId: 1,
      roomId: null,
      blockSize: 1,
      slotIndex: 0,
      ...inPersonPlacementExtras,
    };
    const unavailable = new Map([
      [
        "t1",
        [
          {
            dayOfWeek: Day.MONDAY,
            startTime: new Date(2020, 0, 1, 8, 0, 0, 0),
            endTime: new Date(2020, 0, 1, 18, 0, 0, 0),
          },
        ],
      ],
    ]);
    const slots = enumerateCandidatesForTask(task, periods, [], unavailable);
    expect(slots.every((s) => s.day !== Day.MONDAY)).toBe(true);
    expect(slots.length).toBeGreaterThan(0);
  });

  it("buildConflictPairs adds edge when same teacher slots overlap", () => {
    const t1: PlacementTask = {
      requirementIndex: 0,
      subjectId: 1,
      teacherId: "T",
      classId: 1,
      roomId: null,
      blockSize: 1,
      slotIndex: 0,
      ...inPersonPlacementExtras,
    };
    const t2: PlacementTask = {
      requirementIndex: 1,
      subjectId: 2,
      teacherId: "T",
      classId: 2,
      roomId: null,
      blockSize: 1,
      slotIndex: 0,
      ...inPersonPlacementExtras,
    };
    const mon = Day.MONDAY;
    const s1 = {
      day: mon,
      startPeriodId: "a",
      endPeriodId: null as string | null,
      periodName: "P1",
      startTime: new Date(2024, 0, 1, 8, 0, 0, 0),
      endTime: new Date(2024, 0, 1, 9, 0, 0, 0),
    };
    const s2 = {
      day: mon,
      startPeriodId: "a",
      endPeriodId: null as string | null,
      periodName: "P1",
      startTime: new Date(2024, 0, 1, 8, 0, 0, 0),
      endTime: new Date(2024, 0, 1, 9, 0, 0, 0),
    };
    const conflicts = buildConflictPairs([t1, t2], [[s1], [s2]]);
    expect(conflicts.some((c) => c[0] === 0 && c[2] === 1 && c[1] === 0 && c[3] === 0)).toBe(true);
  });

  it("tasksCanShareConflictResource is false for disjoint teacher/class/room", () => {
    const a: PlacementTask = {
      requirementIndex: 0,
      subjectId: 1,
      teacherId: "t1",
      classId: 1,
      roomId: null,
      blockSize: 1,
      slotIndex: 0,
      ...inPersonPlacementExtras,
    };
    const b: PlacementTask = {
      requirementIndex: 1,
      subjectId: 2,
      teacherId: "t2",
      classId: 2,
      roomId: null,
      blockSize: 1,
      slotIndex: 0,
      ...inPersonPlacementExtras,
    };
    expect(tasksCanShareConflictResource(a, b)).toBe(false);
  });

  it("partitionSingleClassForSolver matches capacity rules", () => {
    const periods = [p("a", 1, 8, 9)];
    const part = partitionSingleClassForSolver({
      periods,
      requirements: [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 10, roomId: null }],
      classId: 1,
    });
    expect(part.validTasks).toHaveLength(0);
    expect(part.capacityUnplaced.length).toBe(10);
  });
});
