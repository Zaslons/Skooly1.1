import { describe, expect, it } from "vitest";
import {
  buildGridInitializationBlockers,
  isGridInitializationComplete,
} from "@/lib/domain/temporalRules";

describe("isGridInitializationComplete (Phase 5 strict)", () => {
  it("requires at least one lesson and one active period", () => {
    expect(isGridInitializationComplete(0, 0)).toBe(false);
    expect(isGridInitializationComplete(1, 0)).toBe(false);
    expect(isGridInitializationComplete(0, 1)).toBe(false);
    expect(isGridInitializationComplete(1, 1)).toBe(true);
    expect(isGridInitializationComplete(5, 3)).toBe(true);
  });
});

describe("buildGridInitializationBlockers", () => {
  it("lists missing lessons and periods", () => {
    expect(buildGridInitializationBlockers(0, 0)).toEqual([
      "No lessons configured yet.",
      "No active bell periods defined.",
    ]);
    expect(buildGridInitializationBlockers(1, 0)).toEqual(["No active bell periods defined."]);
    expect(buildGridInitializationBlockers(0, 1)).toEqual(["No lessons configured yet."]);
    expect(buildGridInitializationBlockers(2, 2)).toEqual([]);
  });
});
