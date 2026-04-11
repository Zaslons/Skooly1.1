import { describe, expect, it } from "vitest";
import { periodCreateSchema, periodUpdateSchema } from "@/lib/formValidationSchemas";

describe("period Zod schemas", () => {
  it("accepts valid periodCreateSchema", () => {
    const parsed = periodCreateSchema.safeParse({
      name: "Period 1",
      startTime: "2025-01-01T09:00:00.000Z",
      endTime: "2025-01-01T10:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects end before start on create", () => {
    const parsed = periodCreateSchema.safeParse({
      name: "Bad",
      startTime: "2025-01-01T11:00:00.000Z",
      endTime: "2025-01-01T10:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts partial periodUpdateSchema", () => {
    const parsed = periodUpdateSchema.safeParse({ order: 2 });
    expect(parsed.success).toBe(true);
  });
});
