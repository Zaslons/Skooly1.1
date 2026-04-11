import { describe, expect, it } from "vitest";
import { CalendarExceptionType } from "@prisma/client";
import {
  schoolCalendarExceptionCreateSchema,
  schoolCalendarExceptionUpdateSchema,
} from "@/lib/formValidationSchemas";

describe("calendar exceptions API payload contracts", () => {
  it("accepts valid create payload with EXAM_PERIOD", () => {
    const parsed = schoolCalendarExceptionCreateSchema.safeParse({
      title: "Midterm Window",
      type: CalendarExceptionType.EXAM_PERIOD,
      startDate: "2026-03-01T08:00:00.000Z",
      endDate: "2026-03-07T18:00:00.000Z",
      notes: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts partial update payload", () => {
    const parsed = schoolCalendarExceptionUpdateSchema.safeParse({
      title: "Updated title",
      notes: "Updated notes",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects update payload with non-ascending dates", () => {
    const parsed = schoolCalendarExceptionUpdateSchema.safeParse({
      startDate: "2026-03-09T00:00:00.000Z",
      endDate: "2026-03-01T00:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });
});
