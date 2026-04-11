import { describe, expect, it } from "vitest";
import {
  TIMETABLE_SCHOOL_MAX_REQUIREMENTS,
  applyGradeTemplateToClasses,
  cellKey,
  countWouldExceedCap,
  flatRowCountExceedsCap,
  flatRowsToMatrix,
  matrixToFlatRows,
  matrixToTemplateRows,
  mergeFlatLastWins,
  type SchoolRequirementFlat,
} from "@/lib/domain/timetableRequirementMatrix";

describe("timetableRequirementMatrix", () => {
  it("cellKey is stable", () => {
    expect(cellKey(1, 2)).toBe("1:2");
  });

  it("flat → matrix → flat round-trip (simple)", () => {
    const scopeClassIds = [10, 11];
    const subjectIds = [101, 102];
    const flat: SchoolRequirementFlat[] = [
      { classId: 10, subjectId: 101, teacherId: "t1", periodsPerWeek: 3, blockSize: 2, roomId: null },
      { classId: 10, subjectId: 102, teacherId: "t2", periodsPerWeek: 2, blockSize: 2, roomId: null },
      { classId: 11, subjectId: 101, teacherId: "t1", periodsPerWeek: 4, blockSize: 2, roomId: null },
    ];
    const matrix = flatRowsToMatrix(flat, scopeClassIds, subjectIds);
    expect(matrix.columnTeacherBySubject[101]).toBe("t1");
    expect(matrix.columnTeacherBySubject[102]).toBe("t2");
    expect(matrix.cells[cellKey(11, 102)].periodsPerWeek).toBe(0);

    const back = matrixToFlatRows(matrix, scopeClassIds);
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error("expected ok");
    expect(back.rows).toHaveLength(3);
    expect(back.rows).toEqual(expect.arrayContaining(flat));
  });

  it("last-write-wins for duplicate (class, subject)", () => {
    const flat: SchoolRequirementFlat[] = [
      { classId: 10, subjectId: 101, teacherId: "a", periodsPerWeek: 1, blockSize: 1, roomId: null },
      { classId: 10, subjectId: 101, teacherId: "b", periodsPerWeek: 5, blockSize: 1, roomId: null },
    ];
    const matrix = flatRowsToMatrix(flat, [10], [101]);
    expect(matrix.cells[cellKey(10, 101)].periodsPerWeek).toBe(5);
    expect(matrix.cells[cellKey(10, 101)].teacherIdOverride).toBe("b");
  });

  it("stores teacher override when different from column default", () => {
    const flat: SchoolRequirementFlat[] = [
      { classId: 10, subjectId: 101, teacherId: "tCol", periodsPerWeek: 2, blockSize: 1, roomId: null },
      { classId: 11, subjectId: 101, teacherId: "tOther", periodsPerWeek: 3, blockSize: 1, roomId: null },
    ];
    const matrix = flatRowsToMatrix(flat, [10, 11], [101]);
    expect(matrix.columnTeacherBySubject[101]).toBe("tCol");
    expect(matrix.cells[cellKey(11, 101)].teacherIdOverride).toBe("tOther");
    const back = matrixToFlatRows(matrix, [10, 11]);
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error("expected ok");
    const r11 = back.rows.find((r) => r.classId === 11 && r.subjectId === 101);
    expect(r11?.teacherId).toBe("tOther");
  });

  it("applyGradeTemplateToClasses fans out rows", () => {
    const template = [
      { subjectId: 1, teacherId: "x", periodsPerWeek: 2, blockSize: 1, roomId: null as number | null },
    ];
    const flat = applyGradeTemplateToClasses(template, [100, 200]);
    expect(flat).toHaveLength(2);
    expect(flat.map((r) => r.classId).sort()).toEqual([100, 200]);
  });

  it("matrixToFlatRows rejects when over cap", () => {
    const subjectIds = Array.from({ length: 201 }, (_, i) => i + 1);
    const state = flatRowsToMatrix(
      [{ classId: 1, subjectId: 1, teacherId: "t", periodsPerWeek: 1, blockSize: 1, roomId: null }],
      [1],
      [1]
    );
    const wide: typeof state = {
      ...state,
      subjectIds,
      cells: {},
      columnTeacherBySubject: Object.fromEntries(subjectIds.map((id) => [id, "t"])),
    };
    for (const sid of subjectIds) {
      wide.cells[cellKey(1, sid)] = { periodsPerWeek: 1, teacherIdOverride: null };
    }
    const res = matrixToFlatRows(wide, [1]);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.code).toBe("EXCEEDS_CAP");
  });

  it("countWouldExceedCap", () => {
    expect(countWouldExceedCap(10, 21)).toBe(true);
    expect(countWouldExceedCap(10, 20)).toBe(false);
    expect(flatRowCountExceedsCap(TIMETABLE_SCHOOL_MAX_REQUIREMENTS + 1)).toBe(true);
  });

  it("mergeFlatLastWins: b overrides a for same key", () => {
    const a: SchoolRequirementFlat[] = [
      { classId: 1, subjectId: 2, teacherId: "x", periodsPerWeek: 1, blockSize: 1, roomId: null },
    ];
    const b: SchoolRequirementFlat[] = [
      { classId: 1, subjectId: 2, teacherId: "y", periodsPerWeek: 3, blockSize: 1, roomId: null },
    ];
    const m = mergeFlatLastWins(a, b);
    expect(m).toHaveLength(1);
    expect(m[0].periodsPerWeek).toBe(3);
    expect(m[0].teacherId).toBe("y");
  });

  it("matrixToTemplateRows uses prototype class row", () => {
    const flat: SchoolRequirementFlat[] = [
      { classId: 7, subjectId: 10, teacherId: "t1", periodsPerWeek: 4, blockSize: 2, roomId: null },
      { classId: 8, subjectId: 10, teacherId: "t2", periodsPerWeek: 1, blockSize: 2, roomId: null },
    ];
    const matrix = flatRowsToMatrix(flat, [7, 8], [10]);
    const tmpl = matrixToTemplateRows(matrix, 7);
    expect(tmpl).toHaveLength(1);
    expect(tmpl[0].periodsPerWeek).toBe(4);
    expect(tmpl[0].subjectId).toBe(10);
  });
});
