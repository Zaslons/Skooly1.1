import { describe, expect, it } from "vitest";
import { assertCalendarExceptionWithinTerm, TemporalRuleError } from "@/lib/domain/temporalRules";
import {
  schoolCalendarExceptionCreateSchema,
  schoolCalendarExceptionUpdateSchema,
} from "@/lib/formValidationSchemas";

describe("calendar exception rules", () => {
  const termStart = new Date("2026-01-01T00:00:00.000Z");
  const termEnd = new Date("2026-03-31T23:59:59.000Z");

  it("accepts exception fully inside term", () => {
    expect(() =>
      assertCalendarExceptionWithinTerm({
        termStartDate: termStart,
        termEndDate: termEnd,
        exceptionStart: new Date("2026-02-01T00:00:00.000Z"),
        exceptionEnd: new Date("2026-02-02T00:00:00.000Z"),
      })
    ).not.toThrow();
  });

  it("rejects outside-term ranges", () => {
    expect(() =>
      assertCalendarExceptionWithinTerm({
        termStartDate: termStart,
        termEndDate: termEnd,
        exceptionStart: new Date("2025-12-31T23:00:00.000Z"),
        exceptionEnd: new Date("2026-01-02T00:00:00.000Z"),
      })
    ).toThrowError(TemporalRuleError);
  });

  it("rejects start >= end", () => {
    expect(() =>
      assertCalendarExceptionWithinTerm({
        termStartDate: termStart,
        termEndDate: termEnd,
        exceptionStart: new Date("2026-02-10T10:00:00.000Z"),
        exceptionEnd: new Date("2026-02-10T10:00:00.000Z"),
      })
    ).toThrowError(TemporalRuleError);
  });

  it("parses create payload", () => {
    const parsed = schoolCalendarExceptionCreateSchema.safeParse({
      title: "Mid-year break",
      type: "BREAK",
      startDate: "2026-02-10T00:00:00.000Z",
      endDate: "2026-02-15T00:00:00.000Z",
      notes: "optional",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects bad update ordering", () => {
    const parsed = schoolCalendarExceptionUpdateSchema.safeParse({
      startDate: "2026-02-15T00:00:00.000Z",
      endDate: "2026-02-10T00:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });
});
