import { describe, expect, it } from "vitest";
import { buildPeriodGridModel } from "@/lib/domain/periodGridAdapter";
import type { ScheduleEvent } from "@/components/BigCalender";

describe("period grid calendar mapping integration", () => {
  it("builds a full week model with stable day and period counts", () => {
    const events: ScheduleEvent[] = [
      {
        id: "ls-9",
        title: "Physics",
        start: new Date("2026-02-02T08:00:00.000Z"),
        end: new Date("2026-02-02T10:00:00.000Z"),
        extendedProps: { kind: "lesson_session", popQuizzes: [], assignmentDue: [] },
      },
    ];
    const model = buildPeriodGridModel({
      events,
      periods: [
        {
          id: "p1",
          order: 0,
          name: "P1",
          startTime: new Date("2026-01-01T08:00:00.000Z"),
          endTime: new Date("2026-01-01T09:00:00.000Z"),
        },
        {
          id: "p2",
          order: 1,
          name: "P2",
          startTime: new Date("2026-01-01T09:00:00.000Z"),
          endTime: new Date("2026-01-01T10:00:00.000Z"),
        },
      ],
      rangeStart: new Date("2026-02-02T00:00:00.000Z"),
      rangeEnd: new Date("2026-02-09T00:00:00.000Z"),
    });

    expect(model.days.length).toBe(7);
    expect(model.periods.length).toBe(2);
    expect(Object.keys(model.cellsByKey).length).toBe(14);

    const mondayKey = model.days[0].key;
    const p1 = model.cellsByKey[`${mondayKey}:p1`];
    const p2 = model.cellsByKey[`${mondayKey}:p2`];
    expect(p1.lessons.map((l) => l.id)).toEqual(["ls-9"]);
    expect(p1.lessonIsSpanStart).toBe(true);
    expect(p1.lessonSpanLength).toBe(2);
    expect(p2.lessonIsContinuation).toBe(true);
    expect(p2.lessons.length).toBe(0);
  });
});
