import { describe, expect, it } from "vitest";
import { Day } from "@prisma/client";
import {
  utcRangesOverlap,
  weeklyLessonUtcRangeMs,
} from "@/lib/domain/schoolLocalTime";

describe("schoolLocalTime weeklyLessonUtcRangeMs", () => {
  it("is stable for the same school timezone and template times", () => {
    const start = new Date(Date.UTC(1970, 0, 1, 14, 0, 0, 0));
    const end = new Date(Date.UTC(1970, 0, 1, 15, 0, 0, 0));
    const a = weeklyLessonUtcRangeMs(Day.MONDAY, start, end, "Europe/London");
    const b = weeklyLessonUtcRangeMs(Day.MONDAY, start, end, "Europe/London");
    expect(a.startMs).toBe(b.startMs);
    expect(a.endMs).toBe(b.endMs);
  });

  it("treats the same floating clock differently per school TZ (no false overlap)", () => {
    const nineToTenUtc = {
      start: new Date(Date.UTC(1970, 0, 1, 9, 0, 0, 0)),
      end: new Date(Date.UTC(1970, 0, 1, 10, 0, 0, 0)),
    };
    const rangeUtc = weeklyLessonUtcRangeMs(
      Day.MONDAY,
      nineToTenUtc.start,
      nineToTenUtc.end,
      "UTC"
    );
    const rangeNy = weeklyLessonUtcRangeMs(
      Day.MONDAY,
      nineToTenUtc.start,
      nineToTenUtc.end,
      "America/New_York"
    );
    expect(utcRangesOverlap(rangeUtc, rangeNy)).toBe(false);
  });

  it("detects overlap when UTC ranges intersect", () => {
    const a = { startMs: 1000, endMs: 2000 };
    const b = { startMs: 1500, endMs: 2500 };
    expect(utcRangesOverlap(a, b)).toBe(true);
    expect(utcRangesOverlap(a, { startMs: 2000, endMs: 3000 })).toBe(false);
  });
});
