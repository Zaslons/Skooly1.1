import { describe, expect, it } from "vitest";
import {
  generateTermScheduleRequestSchema,
  recurringExamsPayloadSchema,
} from "@/lib/formValidationSchemas";

/**
 * Lightweight integration-style checks: scheduling payloads used by APIs validate as expected.
 */
const SAMPLE_TERM_CUID = "cmjpxeq390000308d0j6g6g1q";

describe("scheduling Zod schemas", () => {
  it("accepts a minimal valid generate-term payload", () => {
    const parsed = generateTermScheduleRequestSchema.safeParse({
      termId: SAMPLE_TERM_CUID,
      mode: "dryRun",
      idempotencyKey: "key-1",
      scope: { type: "school" },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a minimal valid recurring exams payload", () => {
    const parsed = recurringExamsPayloadSchema.safeParse({
      termId: SAMPLE_TERM_CUID,
      loops: [
        {
          weekIndex: 0,
          day: "MONDAY",
          startTime: "09:00",
          durationMinutes: 60,
          classId: 1,
          subjectId: 1,
        },
      ],
      strictMode: true,
    });
    expect(parsed.success).toBe(true);
  });
});
