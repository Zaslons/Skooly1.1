import { describe, expect, it } from "vitest";
import {
  assertLessonFitsDefaultWorkingHoursWindow,
  assertPeriodDoesNotOverlapOthers,
  assertPeriodWithinDefaultSchoolHours,
  assertStartBeforeEnd,
  BellPeriodError,
  computeLessonTimesFromPeriodSpan,
  lessonIntervalContainedInSomeActivePeriod,
  lessonIntervalMatchesPeriodSpan,
  mergePeriodTimesOntoAnchor,
  periodIntervalsOverlap,
  timeOfDayMsLocal,
  validateLessonTimesAgainstBellPolicy,
} from "@/lib/domain/bellPeriodRules";

const t = (h: number, m = 0) => {
  const d = new Date("2025-06-15T12:00:00.000Z");
  d.setHours(h, m, 0, 0);
  return d;
};

describe("timeOfDayMsLocal", () => {
  it("orders morning before afternoon", () => {
    expect(timeOfDayMsLocal(t(9))).toBeLessThan(timeOfDayMsLocal(t(10)));
  });
});

describe("periodIntervalsOverlap", () => {
  it("detects overlap", () => {
    expect(periodIntervalsOverlap(t(9), t(10), t(9, 30), t(11))).toBe(true);
  });

  it("returns false for adjacent non-overlapping (9-10 vs 10-11)", () => {
    expect(periodIntervalsOverlap(t(9), t(10), t(10), t(11))).toBe(false);
  });
});

describe("assertStartBeforeEnd", () => {
  it("throws when end <= start", () => {
    expect(() => assertStartBeforeEnd(t(10), t(9))).toThrow(BellPeriodError);
  });
});

describe("assertPeriodDoesNotOverlapOthers", () => {
  it("throws when overlapping an existing period", () => {
    expect(() =>
      assertPeriodDoesNotOverlapOthers(
        { startTime: t(9, 30), endTime: t(10, 30) },
        [{ id: "a", name: "P1", startTime: t(9), endTime: t(10) }]
      )
    ).toThrow(BellPeriodError);
  });

  it("allows excluding self on update", () => {
    expect(() =>
      assertPeriodDoesNotOverlapOthers(
        { startTime: t(9), endTime: t(10) },
        [{ id: "self", name: "P1", startTime: t(9), endTime: t(10) }],
        "self"
      )
    ).not.toThrow();
  });
});

describe("assertPeriodWithinDefaultSchoolHours", () => {
  it("allows 8:00–17:00", () => {
    expect(() => assertPeriodWithinDefaultSchoolHours(t(8), t(17))).not.toThrow();
  });

  it("rejects before 8:00", () => {
    expect(() => assertPeriodWithinDefaultSchoolHours(t(7), t(9))).toThrow(BellPeriodError);
  });
});

describe("mergePeriodTimesOntoAnchor", () => {
  it("applies period times to the anchor calendar date", () => {
    const anchor = new Date("2025-03-19T00:00:00");
    const period = { startTime: t(9), endTime: t(10) };
    const { startTime, endTime } = mergePeriodTimesOntoAnchor(anchor, period);
    expect(startTime.getFullYear()).toBe(2025);
    expect(startTime.getMonth()).toBe(2);
    expect(startTime.getDate()).toBe(19);
    expect(startTime.getHours()).toBe(9);
    expect(endTime.getHours()).toBe(10);
  });
});

describe("computeLessonTimesFromPeriodSpan", () => {
  it("uses first period start and last period end", () => {
    const anchor = new Date("2025-03-19T00:00:00");
    const startPeriod = { startTime: t(9), endTime: t(10) };
    const endPeriod = { startTime: t(10), endTime: t(11) };
    const { startTime, endTime } = computeLessonTimesFromPeriodSpan(anchor, startPeriod, endPeriod);
    expect(startTime.getHours()).toBe(9);
    expect(startTime.getMinutes()).toBe(0);
    expect(endTime.getHours()).toBe(11);
    expect(endTime.getMinutes()).toBe(0);
  });

  it("works for single period (start === end)", () => {
    const anchor = new Date("2025-03-19T00:00:00");
    const p = { startTime: t(9), endTime: t(10) };
    const { startTime, endTime } = computeLessonTimesFromPeriodSpan(anchor, p, p);
    expect(startTime.getHours()).toBe(9);
    expect(endTime.getHours()).toBe(10);
  });
});

describe("lessonIntervalMatchesPeriodSpan", () => {
  const startPeriod = { startTime: t(9), endTime: t(10) };
  const endPeriod = { startTime: t(10), endTime: t(11) };

  it("returns true when lesson matches span exactly", () => {
    expect(lessonIntervalMatchesPeriodSpan(t(9), t(11), startPeriod, endPeriod)).toBe(true);
  });

  it("returns false when lesson start differs", () => {
    expect(lessonIntervalMatchesPeriodSpan(t(9, 15), t(11), startPeriod, endPeriod)).toBe(false);
  });

  it("returns false when lesson end differs", () => {
    expect(lessonIntervalMatchesPeriodSpan(t(9), t(10, 30), startPeriod, endPeriod)).toBe(false);
  });
});

describe("lessonIntervalContainedInSomeActivePeriod", () => {
  const p1 = { id: "a", startTime: t(9), endTime: t(10) };
  const p2 = { id: "b", startTime: t(10), endTime: t(11) };

  it("returns true when fully inside one period", () => {
    expect(lessonIntervalContainedInSomeActivePeriod(t(9, 15), t(9, 45), [p1])).toBe(true);
  });

  it("returns false when spanning two periods", () => {
    expect(lessonIntervalContainedInSomeActivePeriod(t(9, 30), t(10, 30), [p1, p2])).toBe(false);
  });
});

describe("assertLessonFitsDefaultWorkingHoursWindow", () => {
  it("allows 8:00–17:00 end", () => {
    expect(() => assertLessonFitsDefaultWorkingHoursWindow(t(8), t(17))).not.toThrow();
  });

  it("rejects end after 17:00 with minutes", () => {
    expect(() => assertLessonFitsDefaultWorkingHoursWindow(t(8), t(17, 1))).toThrow(BellPeriodError);
  });
});

describe("validateLessonTimesAgainstBellPolicy", () => {
  it("uses default window when no periods", () => {
    expect(() => validateLessonTimesAgainstBellPolicy(t(7), t(9), [])).toThrow(BellPeriodError);
    expect(() => validateLessonTimesAgainstBellPolicy(t(9), t(10), [])).not.toThrow();
  });

  it("requires containment when periods exist", () => {
    const periods = [{ id: "a", startTime: t(9), endTime: t(10) }];
    expect(() => validateLessonTimesAgainstBellPolicy(t(7), t(8), periods)).toThrow(BellPeriodError);
    expect(() => validateLessonTimesAgainstBellPolicy(t(9), t(10), periods)).not.toThrow();
  });

  it("uses examTemplate copy when slotKind is examTemplate", () => {
    const periods = [{ id: "a", startTime: t(9), endTime: t(10) }];
    try {
      validateLessonTimesAgainstBellPolicy(t(7), t(8), periods, { slotKind: "examTemplate" });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(BellPeriodError);
      expect((e as BellPeriodError).message).toContain("Exam template");
    }
  });

  it("accepts periodSpan when interval matches span", () => {
    const periods = [
      { id: "a", startTime: t(9), endTime: t(10) },
      { id: "b", startTime: t(10), endTime: t(11) },
    ];
    const startPeriod = periods[0]!;
    const endPeriod = periods[1]!;
    expect(() =>
      validateLessonTimesAgainstBellPolicy(t(9), t(11), periods, {
        periodSpan: { startPeriod, endPeriod },
      })
    ).not.toThrow();
  });
});
