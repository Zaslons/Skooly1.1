import type { Day, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { ExistingSlot } from "@/lib/domain/timetableAssistant";
import {
  utcRangesOverlap,
  weeklyLessonUtcRangeMs,
} from "@/lib/domain/schoolLocalTime";

type LessonDb = Pick<PrismaClient, "lesson">;

/**
 * Weekly template overlap for the same teacher: same weekday + overlapping absolute time
 * when each lesson's clock is interpreted in that lesson's school timezone (cross-school safe).
 */
export async function findFirstOverlappingLessonForTeacher(
  db: LessonDb,
  params: {
    schoolId: string;
    teacherId: string;
    day: Day;
    lessonStartTime: Date;
    lessonEndTime: Date;
    excludeLessonId?: number;
  }
): Promise<{ id: number; schoolId: string } | null> {
  const {
    schoolId,
    teacherId,
    day,
    lessonStartTime,
    lessonEndTime,
    excludeLessonId,
  } = params;

  const candidates = await db.lesson.findMany({
    where: {
      teacherId,
      day,
      ...(excludeLessonId != null ? { id: { not: excludeLessonId } } : {}),
    },
    select: {
      id: true,
      schoolId: true,
      startTime: true,
      endTime: true,
    },
  });

  const schoolIds = Array.from(
    new Set([schoolId, ...candidates.map((c) => c.schoolId)])
  );
  const tzRows = await prisma.school.findMany({
    where: { id: { in: schoolIds } },
    select: { id: true, timezone: true },
  });
  const tzMap = new Map(
    tzRows.map((r) => [r.id, r.timezone?.trim() || "UTC"])
  );

  const candidateTz = tzMap.get(schoolId) ?? "UTC";
  const candidateRange = weeklyLessonUtcRangeMs(
    day,
    lessonStartTime,
    lessonEndTime,
    candidateTz
  );

  for (const c of candidates) {
    const otherTz = tzMap.get(c.schoolId) ?? "UTC";
    const otherRange = weeklyLessonUtcRangeMs(
      day,
      c.startTime,
      c.endTime,
      otherTz
    );
    if (utcRangesOverlap(candidateRange, otherRange)) {
      return { id: c.id, schoolId: c.schoolId };
    }
  }

  return null;
}

/**
 * Lessons in other schools for these teachers — treat as extra occupancy for timetable greedy placement
 * (teacher cannot be double-booked across schools at the same weekly slot).
 */
export async function loadForeignSchoolLessonsAsExistingSlots(params: {
  schoolId: string;
  teacherIds: string[];
}): Promise<ExistingSlot[]> {
  const { schoolId, teacherIds } = params;
  const unique = Array.from(new Set(teacherIds)).filter(Boolean);
  if (unique.length === 0) return [];
  const rows = await prisma.lesson.findMany({
    where: { schoolId: { not: schoolId }, teacherId: { in: unique } },
    select: {
      id: true,
      day: true,
      startTime: true,
      endTime: true,
      teacherId: true,
      classId: true,
      roomId: true,
    },
  });
  return rows.map((l) => ({
    id: l.id,
    day: l.day,
    startTime: l.startTime,
    endTime: l.endTime,
    teacherId: l.teacherId,
    classId: l.classId,
    roomId: l.roomId,
  }));
}
