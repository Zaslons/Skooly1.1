import type { LessonDeliveryMode } from "@prisma/client";
import type { TimetableAssistantSchoolTemplateRow } from "@/lib/formValidationSchemas";

/** Matches `timetableAssistantSchoolRequirementSchema` shape (validated upstream). */
export const TIMETABLE_SCHOOL_MAX_REQUIREMENTS = 200;

export type SchoolRequirementFlat = {
  classId: number;
  subjectId: number;
  teacherId: string;
  periodsPerWeek: number;
  blockSize: number;
  roomId?: number | null;
  deliveryMode?: LessonDeliveryMode;
  meetingUrl?: string | null;
  meetingLabel?: string | null;
};

export type MatrixCellState = {
  /** 0 = omit from flattened requirements */
  periodsPerWeek: number;
  /** When set, overrides `columnTeacherBySubject[subjectId]` for this cell */
  teacherIdOverride: string | null;
};

export type MatrixGridState = {
  columnTeacherBySubject: Record<number, string>;
  cells: Record<string, MatrixCellState>;
  globalBlockSize: number;
  globalRoomId: number | null;
  subjectIds: number[];
};

export function cellKey(classId: number, subjectId: number): string {
  return `${classId}:${subjectId}`;
}

export function inferColumnTeachersFromFlat(
  rows: SchoolRequirementFlat[],
  subjectIds: number[]
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const sid of subjectIds) {
    const first = rows.find((r) => r.subjectId === sid);
    if (first) out[sid] = first.teacherId;
  }
  return out;
}

/**
 * Last-write-wins per (classId, subjectId). Only rows whose class is in `scopeClassIds`
 * and subject in `subjectIds` participate.
 */
export function flatRowsToMatrix(
  rows: SchoolRequirementFlat[],
  scopeClassIds: number[],
  subjectIds: number[]
): MatrixGridState {
  const scopeSet = new Set(scopeClassIds);
  const subjectSet = new Set(subjectIds);
  const lastByKey = new Map<string, SchoolRequirementFlat>();
  for (const r of rows) {
    if (!scopeSet.has(r.classId) || !subjectSet.has(r.subjectId)) continue;
    lastByKey.set(cellKey(r.classId, r.subjectId), r);
  }

  const filtered = rows.filter((r) => scopeSet.has(r.classId) && subjectSet.has(r.subjectId));
  const columnTeacherBySubject = inferColumnTeachersFromFlat(filtered, subjectIds);

  const cells: Record<string, MatrixCellState> = {};
  for (const classId of scopeClassIds) {
    for (const subjectId of subjectIds) {
      const k = cellKey(classId, subjectId);
      const row = lastByKey.get(k);
      if (!row) {
        cells[k] = { periodsPerWeek: 0, teacherIdOverride: null };
        continue;
      }
      const col = columnTeacherBySubject[subjectId] ?? row.teacherId;
      cells[k] = {
        periodsPerWeek: row.periodsPerWeek,
        teacherIdOverride: row.teacherId === col ? null : row.teacherId,
      };
    }
  }

  const first = filtered[0];
  const globalBlockSize = first?.blockSize ?? 1;
  const globalRoomId = first?.roomId ?? null;

  return {
    columnTeacherBySubject,
    cells,
    globalBlockSize,
    globalRoomId,
    subjectIds: [...subjectIds],
  };
}

export type MatrixToFlatResult =
  | { ok: true; rows: SchoolRequirementFlat[] }
  | { ok: false; code: "EXCEEDS_CAP" | "MISSING_TEACHER"; message: string };

export function matrixToFlatRows(state: MatrixGridState, scopeClassIds: number[]): MatrixToFlatResult {
  const rows: SchoolRequirementFlat[] = [];
  for (const classId of scopeClassIds) {
    for (const subjectId of state.subjectIds) {
      const k = cellKey(classId, subjectId);
      const cell = state.cells[k];
      const periods = cell?.periodsPerWeek ?? 0;
      if (periods <= 0) continue;

      const col = state.columnTeacherBySubject[subjectId];
      if (!col) {
        return {
          ok: false,
          code: "MISSING_TEACHER",
          message: `Set a default teacher for subject ${subjectId}.`,
        };
      }
      const teacherId = cell?.teacherIdOverride ?? col;
      rows.push({
        classId,
        subjectId,
        teacherId,
        periodsPerWeek: periods,
        blockSize: state.globalBlockSize,
        roomId: state.globalRoomId,
      });
    }
  }
  if (rows.length > TIMETABLE_SCHOOL_MAX_REQUIREMENTS) {
    return {
      ok: false,
      code: "EXCEEDS_CAP",
      message: `Too many requirement rows (${rows.length}). Max ${TIMETABLE_SCHOOL_MAX_REQUIREMENTS}.`,
    };
  }
  return { ok: true, rows };
}

export function applyGradeTemplateToClasses(
  templateRows: TimetableAssistantSchoolTemplateRow[],
  classIds: number[]
): SchoolRequirementFlat[] {
  const out: SchoolRequirementFlat[] = [];
  for (const cid of classIds) {
    for (const t of templateRows) {
      out.push({
        classId: cid,
        subjectId: t.subjectId,
        teacherId: t.teacherId,
        periodsPerWeek: t.periodsPerWeek,
        blockSize: t.blockSize,
        roomId: t.roomId ?? null,
        deliveryMode: t.deliveryMode,
        meetingUrl: t.meetingUrl,
        meetingLabel: t.meetingLabel,
      });
    }
  }
  return out;
}

export function countWouldExceedCap(classCount: number, templateRowCount: number): boolean {
  if (classCount <= 0 || templateRowCount <= 0) return false;
  return classCount * templateRowCount > TIMETABLE_SCHOOL_MAX_REQUIREMENTS;
}

export function flatRowCountExceedsCap(count: number): boolean {
  return count > TIMETABLE_SCHOOL_MAX_REQUIREMENTS;
}

/** Later entries override earlier for the same (classId, subjectId). */
export function mergeFlatLastWins(a: SchoolRequirementFlat[], b: SchoolRequirementFlat[]): SchoolRequirementFlat[] {
  const m = new Map<string, SchoolRequirementFlat>();
  for (const r of a) m.set(cellKey(r.classId, r.subjectId), r);
  for (const r of b) m.set(cellKey(r.classId, r.subjectId), r);
  return Array.from(m.values());
}

/**
 * Build a grade-level template from one “prototype” class row in the matrix (first class in scope is typical).
 */
export function matrixToTemplateRows(
  state: MatrixGridState,
  prototypeClassId: number
): TimetableAssistantSchoolTemplateRow[] {
  const rows: TimetableAssistantSchoolTemplateRow[] = [];
  for (const subjectId of state.subjectIds) {
    const k = cellKey(prototypeClassId, subjectId);
    const cell = state.cells[k];
    const periods = cell?.periodsPerWeek ?? 0;
    if (periods <= 0) continue;
    const teacherId = cell?.teacherIdOverride ?? state.columnTeacherBySubject[subjectId];
    if (!teacherId) continue;
    rows.push({
      subjectId,
      teacherId,
      periodsPerWeek: periods,
      blockSize: state.globalBlockSize,
      roomId: state.globalRoomId,
    });
  }
  return rows;
}
