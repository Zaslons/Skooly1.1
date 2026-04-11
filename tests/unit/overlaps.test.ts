import { describe, expect, it } from "vitest";
import { overlaps } from "@/lib/domain/termLessonGenerationRules";

describe("overlaps", () => {
  it("returns false for adjacent intervals (touching at boundary)", () => {
    const aStart = new Date("2025-01-01T09:00:00.000Z");
    const aEnd = new Date("2025-01-01T10:00:00.000Z");
    const bStart = new Date("2025-01-01T10:00:00.000Z");
    const bEnd = new Date("2025-01-01T11:00:00.000Z");
    expect(overlaps(aStart, aEnd, bStart, bEnd)).toBe(false);
  });

  it("returns true for partial overlap", () => {
    const aStart = new Date("2025-01-01T09:30:00.000Z");
    const aEnd = new Date("2025-01-01T10:30:00.000Z");
    const bStart = new Date("2025-01-01T10:00:00.000Z");
    const bEnd = new Date("2025-01-01T11:00:00.000Z");
    expect(overlaps(aStart, aEnd, bStart, bEnd)).toBe(true);
  });

  it("returns false for disjoint intervals", () => {
    const aStart = new Date("2025-01-01T08:00:00.000Z");
    const aEnd = new Date("2025-01-01T09:00:00.000Z");
    const bStart = new Date("2025-01-01T10:00:00.000Z");
    const bEnd = new Date("2025-01-01T11:00:00.000Z");
    expect(overlaps(aStart, aEnd, bStart, bEnd)).toBe(false);
  });
});
