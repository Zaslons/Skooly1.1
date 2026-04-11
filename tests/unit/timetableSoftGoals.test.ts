import { describe, expect, it } from "vitest";
import { Day } from "@prisma/client";
import { buildSoftObjectiveInputs, DEFAULT_SOFT_WEIGHTS } from "@/lib/domain/timetableSoftGoals";
import { inPersonPlacementExtras, type PlacementTask } from "@/lib/domain/timetableAssistant";
import type { CandidateSlot } from "@/lib/domain/timetableFeasibility";

const slot = (
  day: Day,
  startH: number,
  startM: number,
  endH: number,
  endM: number
): CandidateSlot => ({
  day,
  startPeriodId: "p",
  endPeriodId: null,
  periodName: "P",
  startTime: new Date(2024, 0, 1, startH, startM, 0, 0),
  endTime: new Date(2024, 0, 1, endH, endM, 0, 0),
});

describe("timetableSoftGoals", () => {
  it("exports default weights from §5.1", () => {
    expect(DEFAULT_SOFT_WEIGHTS).toEqual({ sg1: 10, sg2: 15, sg3: 10, sg4: 10 });
  });

  it("SG2 adds pairwise same-day for same requirement row", () => {
    const tasks: PlacementTask[] = [
      {
        requirementIndex: 0,
        subjectId: 1,
        teacherId: "t1",
        classId: 1,
        roomId: null,
        blockSize: 1,
        slotIndex: 0,
        ...inPersonPlacementExtras,
      },
      {
        requirementIndex: 0,
        subjectId: 1,
        teacherId: "t1",
        classId: 1,
        roomId: null,
        blockSize: 1,
        slotIndex: 1,
        ...inPersonPlacementExtras,
      },
    ];
    const mon = Day.MONDAY;
    const tue = Day.TUESDAY;
    const candidates: CandidateSlot[][] = [
      [slot(mon, 8, 0, 9, 0), slot(tue, 8, 0, 9, 0)],
      [slot(mon, 9, 0, 10, 0), slot(tue, 9, 0, 10, 0)],
    ];
    const { pairwiseTerms } = buildSoftObjectiveInputs({ tasks, candidatesByTask: candidates });
    const sameDay = pairwiseTerms.filter((p) => p.i === 0 && p.j === 1 && p.k === 0 && p.l === 0);
    expect(sameDay.length).toBe(1);
    expect(sameDay[0].coeff).toBeGreaterThan(0);
  });

  it("merges coefficients for same i,k,j,l", () => {
    const tasks: PlacementTask[] = [
      {
        requirementIndex: 0,
        subjectId: 1,
        teacherId: "t1",
        classId: 1,
        roomId: null,
        blockSize: 1,
        slotIndex: 0,
        ...inPersonPlacementExtras,
      },
      {
        requirementIndex: 0,
        subjectId: 1,
        teacherId: "t1",
        classId: 1,
        roomId: null,
        blockSize: 1,
        slotIndex: 1,
        ...inPersonPlacementExtras,
      },
    ];
    const mon = Day.MONDAY;
    const candidates: CandidateSlot[][] = [
      [slot(mon, 8, 0, 9, 0)],
      [slot(mon, 10, 0, 11, 0)],
    ];
    const { pairwiseTerms } = buildSoftObjectiveInputs({ tasks, candidatesByTask: candidates });
    const p = pairwiseTerms.find((x) => x.i === 0 && x.j === 1 && x.k === 0 && x.l === 0);
    expect(p).toBeDefined();
    expect(p!.coeff).toBeGreaterThan(DEFAULT_SOFT_WEIGHTS.sg2 * 100);
  });
});
