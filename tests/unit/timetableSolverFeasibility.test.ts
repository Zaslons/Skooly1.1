import { describe, expect, it } from "vitest";
import { Day } from "@prisma/client";
import {
  runCpSatFeasibilityPlacement,
  runCpSatOptimizePlacement,
} from "@/lib/domain/timetableSolverFeasibility";
import { inPersonPlacementExtras, type PlacementTask } from "@/lib/domain/timetableAssistant";

describe("timetableSolverFeasibility", () => {
  it("maps solver response to proposals", async () => {
    const periods = [
      {
        id: "a",
        name: "P1",
        order: 1,
        startTime: new Date(2024, 0, 1, 8, 0, 0, 0),
        endTime: new Date(2024, 0, 1, 9, 0, 0, 0),
      },
    ];
    const task: PlacementTask = {
      requirementIndex: 0,
      subjectId: 1,
      teacherId: "t1",
      classId: 10,
      roomId: null,
      blockSize: 1,
      slotIndex: 0,
      ...inPersonPlacementExtras,
    };
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, choice: [0] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await runCpSatFeasibilityPlacement({
      tasks: [task],
      sortedPeriods: periods,
      existing: [],
      teacherUnavailableByTeacherId: new Map(),
      subjectNameById: new Map([[1, "Math"]]),
      classNameById: new Map([[10, "1A"]]),
      solverBaseUrl: "http://localhost:8000",
      solverSecret: "secret",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].day).toBe(Day.MONDAY);
      expect(result.proposals[0].name).toContain("Math");
    }
  });

  it("returns SOLVER_TIMEOUT on abort", async () => {
    const task: PlacementTask = {
      requirementIndex: 0,
      subjectId: 1,
      teacherId: "t1",
      classId: 10,
      roomId: null,
      blockSize: 1,
      slotIndex: 0,
      ...inPersonPlacementExtras,
    };
    const periods = [
      {
        id: "a",
        name: "P1",
        order: 1,
        startTime: new Date(2024, 0, 1, 8, 0, 0, 0),
        endTime: new Date(2024, 0, 1, 9, 0, 0, 0),
      },
    ];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const ac = init?.signal as AbortSignal;
      await new Promise((r) => setTimeout(r, 50));
      if (ac?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Response(JSON.stringify({ ok: true, choice: [0] }), { status: 200 });
    };

    const result = await runCpSatFeasibilityPlacement({
      tasks: [task],
      sortedPeriods: periods,
      existing: [],
      teacherUnavailableByTeacherId: new Map(),
      subjectNameById: new Map([[1, "Math"]]),
      classNameById: new Map([[10, "1A"]]),
      solverBaseUrl: "http://localhost:8000",
      solverSecret: "secret",
      timeoutMs: 5,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SOLVER_TIMEOUT");
  });

  it("POSTs schemaVersion 2 with linearCost and pairwiseTerms to solve-optimize", async () => {
    const task: PlacementTask = {
      requirementIndex: 0,
      subjectId: 1,
      teacherId: "t1",
      classId: 10,
      roomId: null,
      blockSize: 1,
      slotIndex: 0,
      ...inPersonPlacementExtras,
    };
    const periods = [
      {
        id: "a",
        name: "P1",
        order: 1,
        startTime: new Date(2024, 0, 1, 8, 0, 0, 0),
        endTime: new Date(2024, 0, 1, 9, 0, 0, 0),
      },
    ];
    let capturedUrl = "";
    let capturedBody: unknown;
    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(JSON.stringify({ ok: true, choice: [0] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await runCpSatOptimizePlacement({
      tasks: [task],
      sortedPeriods: periods,
      existing: [],
      teacherUnavailableByTeacherId: new Map(),
      subjectNameById: new Map([[1, "Math"]]),
      classNameById: new Map([[10, "1A"]]),
      solverBaseUrl: "http://localhost:8000",
      solverSecret: "secret",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(capturedUrl).toContain("/solve-optimize");
    const body = capturedBody as {
      schemaVersion: number;
      linearCost: number[][];
      pairwiseTerms: unknown[];
    };
    expect(body.schemaVersion).toBe(2);
    expect(Array.isArray(body.linearCost)).toBe(true);
    expect(body.linearCost[0].length).toBeGreaterThan(0);
    expect(body.linearCost[0].every((c) => typeof c === "number")).toBe(true);
    expect(Array.isArray(body.pairwiseTerms)).toBe(true);
  });
});
