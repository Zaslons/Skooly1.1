import { describe, expect, it } from "vitest";
import { buildPeriodGridModel } from "@/lib/domain/periodGridAdapter";
import type { ScheduleEvent } from "@/components/BigCalender";

describe("periodGridAdapter", () => {
  const periods = [
    {
      id: "p1",
      order: 0,
      name: "Period 1",
      startTime: new Date("2026-01-01T08:00:00.000Z"),
      endTime: new Date("2026-01-01T09:00:00.000Z"),
    },
    {
      id: "p2",
      order: 1,
      name: "Period 2",
      startTime: new Date("2026-01-01T09:00:00.000Z"),
      endTime: new Date("2026-01-01T10:00:00.000Z"),
    },
  ];

  it("maps lesson, exam, chips and exceptions into cells", () => {
    const events: ScheduleEvent[] = [
      {
        id: "ls-1",
        title: "Math",
        start: new Date("2026-01-05T08:00:00.000Z"),
        end: new Date("2026-01-05T09:00:00.000Z"),
        extendedProps: { kind: "lesson_session", popQuizzes: [{}], assignmentDue: [{}] },
      },
      {
        id: "ex-1",
        title: "Exam",
        start: new Date("2026-01-05T08:30:00.000Z"),
        end: new Date("2026-01-05T09:30:00.000Z"),
        extendedProps: { kind: "exam" },
      },
      {
        id: "ov-1",
        title: "Holiday",
        start: new Date("2026-01-05T00:00:00.000Z"),
        end: new Date("2026-01-05T23:59:00.000Z"),
        extendedProps: { kind: "overlay", overlayType: "HOLIDAY", exceptionId: "exc-1", overlayTitle: "Holiday" },
      },
    ];

    const model = buildPeriodGridModel({
      events,
      periods,
      rangeStart: new Date("2026-01-05T00:00:00.000Z"),
      rangeEnd: new Date("2026-01-12T00:00:00.000Z"),
    });

    const mondayKey = model.days[0].key;
    const cell = model.cellsByKey[`${mondayKey}:p1`];
    expect(cell.exceptions.length).toBeGreaterThan(0);
    // Exception-blocked cells suppress lessons/exams/chips in period-grid rendering.
    expect(cell.lessons.length).toBe(0);
    expect(cell.exams.length).toBe(0);
    expect(cell.chips.length).toBe(0);
  });

  it("marks multi-period lesson as one span start + continuation cells", () => {
    const events: ScheduleEvent[] = [
      {
        id: "ls-span",
        title: "Physics",
        start: new Date("2026-01-05T08:00:00.000Z"),
        end: new Date("2026-01-05T10:00:00.000Z"),
        extendedProps: { kind: "lesson_session", popQuizzes: [], assignmentDue: [] },
      },
    ];

    const model = buildPeriodGridModel({
      events,
      periods,
      rangeStart: new Date("2026-01-05T00:00:00.000Z"),
      rangeEnd: new Date("2026-01-12T00:00:00.000Z"),
    });

    const mondayKey = model.days[0].key;
    const firstCell = model.cellsByKey[`${mondayKey}:p1`];
    const secondCell = model.cellsByKey[`${mondayKey}:p2`];

    expect(firstCell.lessons.map((l) => l.id)).toEqual(["ls-span"]);
    expect(firstCell.lessonIsSpanStart).toBe(true);
    expect(firstCell.lessonSpanLength).toBe(2);
    expect(firstCell.lessonIsContinuation).toBe(false);

    expect(secondCell.lessons.length).toBe(0);
    expect(secondCell.lessonIsContinuation).toBe(true);
    expect(secondCell.lessonSpanParentCellId).toBe(firstCell.cellId);
  });

  it("keeps multiple single-period lessons in the same cell", () => {
    const events: ScheduleEvent[] = [
      {
        id: "ls-a",
        title: "Math",
        start: new Date("2026-01-05T08:00:00.000Z"),
        end: new Date("2026-01-05T09:00:00.000Z"),
        extendedProps: {
          kind: "lesson_session",
          className: "7A",
          popQuizzes: [],
          assignmentDue: [],
        },
      },
      {
        id: "ls-b",
        title: "Physics",
        start: new Date("2026-01-05T08:00:00.000Z"),
        end: new Date("2026-01-05T09:00:00.000Z"),
        extendedProps: {
          kind: "lesson_session",
          className: "7B",
          popQuizzes: [],
          assignmentDue: [],
        },
      },
    ];

    const model = buildPeriodGridModel({
      events,
      periods,
      rangeStart: new Date("2026-01-05T00:00:00.000Z"),
      rangeEnd: new Date("2026-01-12T00:00:00.000Z"),
    });

    const mondayKey = model.days[0].key;
    const cell = model.cellsByKey[`${mondayKey}:p1`];
    expect(cell.lessons.map((l) => l.id).sort()).toEqual(["ls-a", "ls-b"]);
    expect(cell.lessonSpanLength).toBe(1);
  });
});
