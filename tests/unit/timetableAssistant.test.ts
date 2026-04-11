import { describe, expect, it } from "vitest";
import { Day, LessonDeliveryMode } from "@prisma/client";
import {
  computeTimetablePreview,
  computeTimetablePreviewSchool,
  expandRequirementsToTasks,
  listContiguousPeriodSpans,
  maxContiguousBlockSize,
  TIMETABLE_WEEKDAYS,
} from "@/lib/domain/timetableAssistant";
import { lessonOverlapsTeacherUnavailableRows } from "@/lib/domain/timetableTeacherAvailability";

const p = (id: string, order: number, startH: number, endH: number) => ({
  id,
  name: `P${order}`,
  order,
  startTime: new Date(2024, 0, 1, startH, 0, 0, 0),
  endTime: new Date(2024, 0, 1, endH, 0, 0, 0),
});

describe("timetableAssistant", () => {
  it("expandRequirementsToTasks expands periods per week", () => {
    const tasks = expandRequirementsToTasks(
      [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 3, roomId: null }],
      10
    );
    expect(tasks).toHaveLength(3);
    expect(tasks[0].slotIndex).toBe(0);
    expect(tasks[2].slotIndex).toBe(2);
    expect(tasks.every((t) => t.blockSize === 1)).toBe(true);
  });

  it("expandRequirementsToTasks carries blockSize", () => {
    const tasks = expandRequirementsToTasks(
      [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 2, blockSize: 2, roomId: null }],
      10
    );
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.blockSize === 2)).toBe(true);
  });

  it("expandRequirementsToTasks carries ONLINE delivery and meeting fields", () => {
    const tasks = expandRequirementsToTasks(
      [
        {
          subjectId: 1,
          teacherId: "t1",
          periodsPerWeek: 1,
          roomId: 5,
          deliveryMode: LessonDeliveryMode.ONLINE,
          meetingUrl: "https://example.com/meet",
          meetingLabel: "Zoom",
        },
      ],
      10
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].deliveryMode).toBe(LessonDeliveryMode.ONLINE);
    expect(tasks[0].roomId).toBeNull();
    expect(tasks[0].meetingUrl).toBe("https://example.com/meet");
    expect(tasks[0].meetingLabel).toBe("Zoom");
  });

  it("places lessons into empty grid", () => {
    const periods = [p("a", 1, 8, 9), p("b", 2, 9, 10)];
    const result = computeTimetablePreview({
      periods,
      requirements: [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 1, roomId: null }],
      classId: 1,
      subjectNameById: new Map([[1, "Math"]]),
      className: "1A",
      existing: [],
    });
    expect(result.unplaced).toHaveLength(0);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].day).toBe(Day.MONDAY);
    expect(result.proposals[0].periodId).toBe("a");
    expect(result.proposals[0].endPeriodId).toBeNull();
  });

  it("listContiguousPeriodSpans skips order gaps", () => {
    const periods = [p("a", 1, 8, 9), p("b", 3, 10, 11)];
    expect(listContiguousPeriodSpans(periods, 2)).toHaveLength(0);
    expect(maxContiguousBlockSize(periods)).toBe(1);
  });

  it("places a double-period block when periods are contiguous", () => {
    const periods = [p("a", 1, 8, 9), p("b", 2, 9, 10)];
    expect(listContiguousPeriodSpans(periods, 2)).toHaveLength(1);
    expect(maxContiguousBlockSize(periods)).toBe(2);
    const result = computeTimetablePreview({
      periods,
      requirements: [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 1, blockSize: 2, roomId: null }],
      classId: 1,
      subjectNameById: new Map([[1, "Lab"]]),
      className: "1A",
      existing: [],
    });
    expect(result.unplaced).toHaveLength(0);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].periodId).toBe("a");
    expect(result.proposals[0].endPeriodId).toBe("b");
    expect(result.proposals[0].periodName).toContain("–");
  });

  it("CAPACITY when weighted demand exceeds grid (blockSize)", () => {
    const periods = [p("a", 1, 8, 9)];
    const result = computeTimetablePreview({
      periods,
      requirements: [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 3, blockSize: 2, roomId: null }],
      classId: 1,
      subjectNameById: new Map([[1, "Math"]]),
      className: "1A",
      existing: [],
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.unplaced.every((u) => u.reason === "CAPACITY")).toBe(true);
  });

  it("CAPACITY when blockSize exceeds longest contiguous run", () => {
    const periods = [p("a", 1, 8, 9), p("b", 3, 10, 11)];
    const result = computeTimetablePreview({
      periods,
      requirements: [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 1, blockSize: 2, roomId: null }],
      classId: 1,
      subjectNameById: new Map([[1, "Math"]]),
      className: "1A",
      existing: [],
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.unplaced.every((u) => u.reason === "CAPACITY")).toBe(true);
  });

  it("lessonOverlapsTeacherUnavailableRows matches Monday 8–9 vs lesson 8:30–9:30", () => {
    const lessonStart = new Date(2024, 0, 1, 8, 30, 0, 0);
    const lessonEnd = new Date(2024, 0, 1, 9, 30, 0, 0);
    const rows = [
      {
        dayOfWeek: Day.MONDAY,
        startTime: new Date(2020, 5, 1, 8, 0, 0, 0),
        endTime: new Date(2020, 5, 1, 9, 0, 0, 0),
      },
    ];
    expect(lessonOverlapsTeacherUnavailableRows(Day.MONDAY, lessonStart, lessonEnd, rows)).toBe(true);
  });

  it("skips Monday when teacher is unavailable that day (greedy parity)", () => {
    const periods = [p("a", 1, 8, 9)];
    const teacherUnavailableByTeacherId = new Map([
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
    const result = computeTimetablePreview({
      periods,
      requirements: [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 1, roomId: null }],
      classId: 1,
      subjectNameById: new Map([[1, "Math"]]),
      className: "1A",
      existing: [],
      teacherUnavailableByTeacherId,
    });
    expect(result.unplaced).toHaveLength(0);
    expect(result.proposals[0].day).toBe(Day.TUESDAY);
  });

  it("respects existing teacher conflict", () => {
    const periods = [p("a", 1, 8, 9)];
    const mon = new Date(2024, 0, 1);
    const start = new Date(mon);
    start.setHours(8, 0, 0, 0);
    const end = new Date(mon);
    end.setHours(9, 0, 0, 0);
    const result = computeTimetablePreview({
      periods,
      requirements: [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 1, roomId: null }],
      classId: 1,
      subjectNameById: new Map([[1, "Math"]]),
      className: "1A",
      existing: [
        {
          day: Day.MONDAY,
          startTime: start,
          endTime: end,
          teacherId: "t1",
          classId: 99,
          roomId: null,
        },
      ],
    });
    expect(result.proposals[0].day).toBe(Day.TUESDAY);
  });

  it("fails when required slots exceed grid capacity", () => {
    const periods = [p("a", 1, 8, 9)];
    const result = computeTimetablePreview({
      periods,
      requirements: [{ subjectId: 1, teacherId: "t1", periodsPerWeek: 10, roomId: null }],
      classId: 1,
      subjectNameById: new Map([[1, "Math"]]),
      className: "1A",
      existing: [],
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.unplaced.length).toBeGreaterThan(0);
    expect(result.unplaced[0].reason).toBe("CAPACITY");
  });

  it("TIMETABLE_WEEKDAYS has five days", () => {
    expect(TIMETABLE_WEEKDAYS).toHaveLength(5);
  });

  describe("computeTimetablePreviewSchool", () => {
    it("places two classes sharing one teacher without overlap", () => {
      const periods = [p("a", 1, 8, 9)];
      const result = computeTimetablePreviewSchool({
        periods,
        requirements: [
          { classId: 1, subjectId: 1, teacherId: "t1", periodsPerWeek: 1, roomId: null },
          { classId: 2, subjectId: 2, teacherId: "t1", periodsPerWeek: 1, roomId: null },
        ],
        classOrder: [1, 2],
        subjectNameById: new Map([
          [1, "Math"],
          [2, "Eng"],
        ]),
        classNameById: new Map([
          [1, "1A"],
          [2, "1B"],
        ]),
        existing: [],
      });
      expect(result.unplaced.filter((u) => u.reason === "NO_SLOT")).toHaveLength(0);
      expect(result.proposals).toHaveLength(2);
      const days = result.proposals.map((x) => x.day);
      expect(new Set(days).size).toBe(2);
      expect(result.proposals.every((x) => x.teacherId === "t1")).toBe(true);
    });

    it("marks CAPACITY when a class demands more than 5 x periods per week", () => {
      const periods = [p("a", 1, 8, 9)];
      const result = computeTimetablePreviewSchool({
        periods,
        requirements: [{ classId: 1, subjectId: 1, teacherId: "t1", periodsPerWeek: 10, roomId: null }],
        classOrder: [1],
        subjectNameById: new Map([[1, "Math"]]),
        classNameById: new Map([[1, "1A"]]),
        existing: [],
      });
      expect(result.proposals).toHaveLength(0);
      expect(result.unplaced.every((u) => u.reason === "CAPACITY")).toBe(true);
      expect(result.unplaced).toHaveLength(10);
    });
  });
});
