import { describe, expect, it } from "vitest";
import { Day } from "@prisma/client";
import { dayStart, maxDate, prismaDayToJsWeekday } from "@/lib/domain/assignmentDueDate";

describe("assignmentDueDate pure helpers", () => {
  it("prismaDayToJsWeekday maps enums to JS getDay()", () => {
    expect(prismaDayToJsWeekday(Day.SUNDAY)).toBe(0);
    expect(prismaDayToJsWeekday(Day.MONDAY)).toBe(1);
    expect(prismaDayToJsWeekday(Day.SATURDAY)).toBe(6);
  });

  it("dayStart zeroes time fields", () => {
    const d = new Date("2025-06-15T14:30:45.123Z");
    const s = dayStart(d);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    expect(s.getMilliseconds()).toBe(0);
  });

  it("maxDate picks the later instant", () => {
    const a = new Date("2025-01-01T00:00:00.000Z");
    const b = new Date("2025-02-01T00:00:00.000Z");
    expect(maxDate(a, b)).toEqual(b);
    expect(maxDate(b, a)).toEqual(b);
  });

});
