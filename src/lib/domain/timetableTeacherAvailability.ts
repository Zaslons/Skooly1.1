/**
 * Pure helpers for teacher "unavailable" windows vs weekly lesson intervals.
 * Shared by timetable assistant preview (greedy) and commit validation — see docs/timetable/TIMETABLE_SOLVER_PHASE_F_DESIGN.md F.1.
 */

import { Day } from "@prisma/client";

/** Subset of TeacherAvailability used for overlap checks (`isAvailable: false` rows). */
export type TeacherUnavailableRow = {
  dayOfWeek: Day;
  startTime: Date;
  endTime: Date;
};

/**
 * True if [lessonStart, lessonEnd] overlaps any unavailable slot for this teacher on `lessonDay`.
 * Matches semantics of `teacherUnavailableMessage` in timetableAssistantService.ts (time-of-day merged onto lesson date).
 */
export function lessonOverlapsTeacherUnavailableRows(
  lessonDay: Day,
  lessonStart: Date,
  lessonEnd: Date,
  unavailableRowsForTeacher: TeacherUnavailableRow[]
): boolean {
  for (const slot of unavailableRowsForTeacher) {
    if (slot.dayOfWeek !== lessonDay) continue;
    const dbSlotStart = new Date(slot.startTime);
    const dbSlotEnd = new Date(slot.endTime);
    const effectiveSlotStart = new Date(lessonStart);
    effectiveSlotStart.setHours(
      dbSlotStart.getHours(),
      dbSlotStart.getMinutes(),
      dbSlotStart.getSeconds(),
      dbSlotStart.getMilliseconds()
    );
    const effectiveSlotEnd = new Date(lessonStart);
    effectiveSlotEnd.setHours(
      dbSlotEnd.getHours(),
      dbSlotEnd.getMinutes(),
      dbSlotEnd.getSeconds(),
      dbSlotEnd.getMilliseconds()
    );
    if (lessonStart < effectiveSlotEnd && lessonEnd > effectiveSlotStart) {
      return true;
    }
  }
  return false;
}

/**
 * Same as {@link lessonOverlapsTeacherUnavailableRows} using a map keyed by teacher id (preview / greedy).
 */
export function lessonOverlapsTeacherUnavailable(
  lessonDay: Day,
  lessonStart: Date,
  lessonEnd: Date,
  teacherId: string,
  teacherUnavailableByTeacherId: Map<string, TeacherUnavailableRow[]>
): boolean {
  const rows = teacherUnavailableByTeacherId.get(teacherId);
  if (!rows?.length) return false;
  return lessonOverlapsTeacherUnavailableRows(lessonDay, lessonStart, lessonEnd, rows);
}
