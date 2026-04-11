import prisma from "@/lib/prisma";
import crypto from "crypto";
import moment from "moment-timezone";
import { CalendarExceptionType, Day, LessonDeliveryMode } from "@prisma/client";
import type {
  GenerateTermScheduleResponse,
  GenerateTermScheduleScope,
} from "@/lib/formValidationSchemas";

/**
 * Expands weekly `Lesson` templates into dated `LessonSession` rows for a term.
 * Uses `Lesson.startTime` / `endTime` only; multi-period lessons store denormalized times from the span.
 * Time-window rules are enforced when templates are saved via `createLesson` / `updateLesson`, not here.
 */

// Prisma enum string -> JS day number mapping.
const PRISMA_DAY_BY_JS_DOW: Record<number, Day> = {
  0: Day.SUNDAY,
  1: Day.MONDAY,
  2: Day.TUESDAY,
  3: Day.WEDNESDAY,
  4: Day.THURSDAY,
  5: Day.FRIDAY,
  6: Day.SATURDAY,
};

type LessonTemplateLite = {
  id: number;
  name: string;
  day: Day;
  startTime: Date;
  endTime: Date;
  subjectId: number;
  classId: number;
  teacherId: string;
  roomId: number | null;
  deliveryMode: LessonDeliveryMode;
  meetingUrl: string | null;
  meetingLabel: string | null;
};

type OverlappingExamLite = {
  id: number;
  lessonId: number | null;
  startTime: Date;
  endTime: Date;
  lesson: { teacherId: string; roomId: number | null } | null;
};

type TermLessonConflictDetail = GenerateTermScheduleResponse["conflicts"][number];

export type TermLessonGenerationParams = {
  schoolId: string;
  termId: string;
  mode: "dryRun" | "commit";
  requestId: string;
  idempotencyKey: string;
  scope: GenerateTermScheduleScope;
  simulateFailureAtOccurrenceIndex?: number;
};

/** Core payload before API adds durationMs (roadmap 6.4). */
export type TermLessonGenerationCoreResult = Omit<GenerateTermScheduleResponse, "durationMs">;

function deterministicRequestId(params: {
  schoolId: string;
  termId: string;
  mode: string;
  idempotencyKey: string;
  scope: GenerateTermScheduleScope;
}) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        ...params,
      })
    )
    .digest("hex")
    .slice(0, 16);
}

function parseTemplateTimeOfDay(date: Date) {
  // Template lesson times are stored as "floating" clock values; use UTC getters
  // to avoid server locale offsets shifting generated session times.
  return { hours: date.getUTCHours(), minutes: date.getUTCMinutes() };
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

function exceptionReasonFromType(type: CalendarExceptionType): "HOLIDAY" | "BREAK" | "EXAM_PERIOD" {
  if (type === CalendarExceptionType.HOLIDAY) return "HOLIDAY";
  if (type === CalendarExceptionType.BREAK) return "BREAK";
  return "EXAM_PERIOD";
}

async function fetchTermAndSchool(params: { schoolId: string; termId: string }) {
  const { schoolId, termId } = params;
  const [school, term] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, timezone: true },
    }),
    prisma.term.findFirst({
      where: { id: termId, schoolId },
      select: { id: true, startDate: true, endDate: true },
    }),
  ]);

  if (!school) throw new Error("SCHOOL_NOT_FOUND");
  if (!term) throw new Error("TERM_NOT_FOUND");

  return { schoolTimezone: school.timezone ?? "UTC", term };
}

async function filterTemplatesByScope(params: {
  schoolId: string;
  scope: GenerateTermScheduleScope;
  templateLessons: LessonTemplateLite[];
}): Promise<LessonTemplateLite[]> {
  const { schoolId, scope, templateLessons } = params;

  if (scope.type === "school") {
    return templateLessons;
  }

  if (scope.type === "class") {
    const cls = await prisma.class.findFirst({
      where: { id: scope.classId, schoolId },
      select: { id: true },
    });
    if (!cls) {
      throw new Error("SCOPE_CLASS_NOT_FOUND");
    }
    return templateLessons.filter((t) => t.classId === scope.classId);
  }

  // grade
  const classesInGrade = await prisma.class.findMany({
    where: { schoolId, gradeId: scope.gradeId },
    select: { id: true },
  });
  if (classesInGrade.length === 0) {
    throw new Error("SCOPE_GRADE_NOT_FOUND");
  }
  const classIds = new Set(classesInGrade.map((c) => c.id));
  return templateLessons.filter((t) => classIds.has(t.classId));
}

export async function generateTermLessons(
  params: TermLessonGenerationParams
): Promise<TermLessonGenerationCoreResult> {
  const { schoolId, termId, mode, idempotencyKey, simulateFailureAtOccurrenceIndex, scope } = params;

  const requestId =
    params.requestId ?? deterministicRequestId({ schoolId, termId, mode, idempotencyKey, scope });

  // Load foundational data needed for deterministic generation.
  const { schoolTimezone, term } = await fetchTermAndSchool({ schoolId, termId });

  // Load weekly templates (Phase 2/3 lesson grid) for this school.
  const allTemplates = await prisma.lesson.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      day: true,
      startTime: true,
      endTime: true,
      subjectId: true,
      classId: true,
      teacherId: true,
      roomId: true,
      deliveryMode: true,
      meetingUrl: true,
      meetingLabel: true,
    },
    orderBy: { id: "asc" },
  });

  const templateLessons = await filterTemplatesByScope({
    schoolId,
    scope,
    templateLessons: allTemplates,
  });

  const templateLessonsByDay: Record<string, LessonTemplateLite[]> = {};
  for (const t of templateLessons) {
    const key = t.day;
    if (!templateLessonsByDay[key]) templateLessonsByDay[key] = [];
    templateLessonsByDay[key].push(t);
  }

  // Load calendar exceptions for this term.
  const exceptions = await prisma.schoolCalendarException.findMany({
    where: {
      schoolId,
      termId,
      type: { in: [CalendarExceptionType.HOLIDAY, CalendarExceptionType.BREAK, CalendarExceptionType.EXAM_PERIOD] },
    },
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
    },
  });

  // Make exception matching deterministic (stable ordering).
  exceptions.sort((a, b) => {
    const aS = a.startDate.getTime();
    const bS = b.startDate.getTime();
    if (aS !== bS) return aS - bS;
    const aE = a.endDate.getTime();
    const bE = b.endDate.getTime();
    if (aE !== bE) return aE - bE;
    return a.id.localeCompare(b.id);
  });

  const termStartLocalDay = moment.tz(term.startDate, schoolTimezone).startOf("day");
  const termEndLocalDay = moment.tz(term.endDate, schoolTimezone).startOf("day");
  const termStartInstant = termStartLocalDay.toDate();
  const termEndInstant = termEndLocalDay.clone().endOf("day").toDate();

  const teacherIdsForTemplates = Array.from(new Set(templateLessons.map((t) => t.teacherId)));
  const existingSessionsForTeachers =
    teacherIdsForTemplates.length > 0
      ? await prisma.lessonSession.findMany({
          where: {
            teacherId: { in: teacherIdsForTemplates },
            startTime: { lt: termEndInstant },
            endTime: { gt: termStartInstant },
          },
          select: {
            id: true,
            schoolId: true,
            teacherId: true,
            startTime: true,
            endTime: true,
          },
        })
      : [];

  const templateLessonIds = templateLessons.map((t) => t.id);
  const existingSessions = templateLessonIds.length
    ? await prisma.lessonSession.findMany({
        where: {
          termId,
          templateLessonId: { in: templateLessonIds },
          sessionDate: { gte: termStartInstant, lte: termEndInstant },
        },
        select: { templateLessonId: true, sessionDate: true },
      })
    : [];

  const existingKeySet = new Set(existingSessions.map((s) => `${s.templateLessonId}|${s.sessionDate.getTime()}`));

  // Preload exams overlapping the term date window to make candidate-time overlap checks deterministic.
  const overlappingExams: OverlappingExamLite[] = await prisma.exam.findMany({
    where: {
      schoolId,
      startTime: { lt: termEndInstant },
      endTime: { gt: termStartInstant },
    },
    select: {
      id: true,
      lessonId: true,
      startTime: true,
      endTime: true,
      lesson: {
        select: {
          teacherId: true,
          roomId: true,
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  const createCandidates: Array<{
    templateLesson: LessonTemplateLite;
    sessionDate: Date;
    day: Day;
    startTime: Date;
    endTime: Date;
  }> = [];

  const conflicts: TermLessonConflictDetail[] = [];

  /** Pending session intervals in this run (same batch as createCandidates) — no DB id yet. */
  const pendingTeacherSessions: Array<{ teacherId: string; startTime: Date; endTime: Date }> = [];

  const skippedByReason: GenerateTermScheduleResponse["summary"]["skippedByReason"] = {
    HOLIDAY: 0,
    BREAK: 0,
    EXAM_PERIOD: 0,
    ALREADY_EXISTS: 0,
    EXAM_CONFLICT: 0,
    EXAM_CONFLICT_UNKNOWN: 0,
    TEACHER_TIME_CONFLICT: 0,
  };

  const totalCandidates = (() => {
    let count = 0;
    for (let i = 0; i <= termEndLocalDay.diff(termStartLocalDay, "days"); i++) {
      const dayMoment = termStartLocalDay.clone().add(i, "day");
      const jsDow = dayMoment.day(); // 0..6 (Sun..Sat)
      const prismaDay = PRISMA_DAY_BY_JS_DOW[jsDow];
      const templates = templateLessonsByDay[prismaDay] ?? [];
      count += templates.length;
    }
    return count;
  })();

  // Deterministic candidate iteration:
  // - ascending local day within term
  // - within the day: templates sorted by templateLessonId (already ordered)
  for (let i = 0; i <= termEndLocalDay.diff(termStartLocalDay, "days"); i++) {
    const dayMoment = termStartLocalDay.clone().add(i, "day");
    const jsDow = dayMoment.day(); // 0..6 (Sun..Sat)
    const prismaDay = PRISMA_DAY_BY_JS_DOW[jsDow];
    const templates = templateLessonsByDay[prismaDay] ?? [];

    const sessionDate = dayMoment.clone().startOf("day").toDate();

    const activeException = exceptions.find((exc) => {
      const excStart = moment.tz(exc.startDate, schoolTimezone).startOf("day");
      const excEnd = moment.tz(exc.endDate, schoolTimezone).startOf("day");
      return dayMoment.isSameOrAfter(excStart) && dayMoment.isSameOrBefore(excEnd);
    });

    // If a day is inside an exception, skip all templates for that weekday.
    if (activeException) {
      const reason = exceptionReasonFromType(activeException.type);
      skippedByReason[reason] = (skippedByReason[reason] ?? 0) + templates.length;
      continue;
    }

    for (const templateLesson of templates) {
      const sessionKey = `${templateLesson.id}|${sessionDate.getTime()}`;
      if (existingKeySet.has(sessionKey)) {
        skippedByReason.ALREADY_EXISTS = (skippedByReason.ALREADY_EXISTS ?? 0) + 1;
        continue;
      }

      const { hours: startH, minutes: startM } = parseTemplateTimeOfDay(templateLesson.startTime);
      const { hours: endH, minutes: endM } = parseTemplateTimeOfDay(templateLesson.endTime);

      const slotStart = dayMoment.clone().hour(startH).minute(startM).second(0).millisecond(0);
      const slotEnd = dayMoment.clone().hour(endH).minute(endM).second(0).millisecond(0);

      // If template spans past midnight, keep overlap logic consistent by extending end.
      if (slotEnd.isSameOrBefore(slotStart)) {
        slotEnd.add(1, "day");
      }

      const slotStartDate = slotStart.toDate();
      const slotEndDate = slotEnd.toDate();

      const overlapping = overlappingExams.filter((e) => overlaps(e.startTime, e.endTime, slotStartDate, slotEndDate));

      if (overlapping.length > 0) {
        const unknownBlocking = overlapping.find((e) => !e.lessonId || !e.lesson);
        if (unknownBlocking) {
          skippedByReason.EXAM_CONFLICT_UNKNOWN = (skippedByReason.EXAM_CONFLICT_UNKNOWN ?? 0) + 1;
          conflicts.push({
            sessionDate,
            templateLessonId: templateLesson.id,
            reason: "EXAM_CONFLICT_UNKNOWN",
            overlappingExamIds: overlapping.map((e) => e.id),
            overlappingExamLessonIds: overlapping
              .map((e) => e.lessonId)
              .filter((id): id is number => typeof id === "number"),
            overlappingLessonSessionIds: [],
          });
          continue;
        }

        const teacherOrRoomConflicts = overlapping.filter((e) => {
          const examLesson = e.lesson;
          if (!examLesson) return false;
          const teacherConflict = examLesson.teacherId === templateLesson.teacherId;
          const roomConflict =
            templateLesson.roomId != null && examLesson.roomId != null && templateLesson.roomId === examLesson.roomId;
          return teacherConflict || roomConflict;
        });

        if (teacherOrRoomConflicts.length > 0) {
          skippedByReason.EXAM_CONFLICT = (skippedByReason.EXAM_CONFLICT ?? 0) + 1;
          conflicts.push({
            sessionDate,
            templateLessonId: templateLesson.id,
            reason: "EXAM_CONFLICT",
            overlappingExamIds: teacherOrRoomConflicts.map((e) => e.id),
            overlappingExamLessonIds: teacherOrRoomConflicts
              .map((e) => e.lessonId)
              .filter((id): id is number => typeof id === "number"),
            overlappingLessonSessionIds: [],
          });
          continue;
        }
      }

      const dbTeacherOverlap = existingSessionsForTeachers.filter(
        (s) =>
          s.teacherId === templateLesson.teacherId &&
          overlaps(s.startTime, s.endTime, slotStartDate, slotEndDate)
      );
      const pendingTeacherOverlap = pendingTeacherSessions.some(
        (s) =>
          s.teacherId === templateLesson.teacherId &&
          overlaps(s.startTime, s.endTime, slotStartDate, slotEndDate)
      );

      if (dbTeacherOverlap.length > 0 || pendingTeacherOverlap) {
        skippedByReason.TEACHER_TIME_CONFLICT = (skippedByReason.TEACHER_TIME_CONFLICT ?? 0) + 1;
        conflicts.push({
          sessionDate,
          templateLessonId: templateLesson.id,
          reason: "TEACHER_TIME_CONFLICT",
          overlappingExamIds: [],
          overlappingExamLessonIds: [],
          overlappingLessonSessionIds: dbTeacherOverlap.map((s) => s.id),
        });
        continue;
      }

      createCandidates.push({
        templateLesson,
        sessionDate,
        day: prismaDay,
        startTime: slotStartDate,
        endTime: slotEndDate,
      });
      pendingTeacherSessions.push({
        teacherId: templateLesson.teacherId,
        startTime: slotStartDate,
        endTime: slotEndDate,
      });
    }
  }

  const conflictedCount =
    (skippedByReason.EXAM_CONFLICT ?? 0) +
    (skippedByReason.EXAM_CONFLICT_UNKNOWN ?? 0) +
    (skippedByReason.TEACHER_TIME_CONFLICT ?? 0);

  if (mode === "dryRun") {
    return {
      requestId,
      termId,
      scope,
      summary: {
        totalCandidates,
        createdCount: createCandidates.length,
        conflictedCount,
        skippedByReason,
      },
      conflicts,
    };
  }

  // Commit mode: write LessonSession rows deterministically and validate rollback.
  let insertedCount = 0;

  await prisma.$transaction(async (tx) => {
    const batchSize = 100;
    let batch: any[] = [];

    // createOccurrenceIndex counts ONLY eligible creations (not skips).
    let createOccurrenceIndex = 0;

    for (const candidate of createCandidates) {
      if (simulateFailureAtOccurrenceIndex != null && createOccurrenceIndex === simulateFailureAtOccurrenceIndex) {
        // Throwing inside the transaction ensures all prior inserts rollback.
        throw new Error("SIMULATED_FAILURE_IN_TERM_GENERATION");
      }

      batch.push({
        termId,
        schoolId,
        templateLessonId: candidate.templateLesson.id,
        sessionDate: candidate.sessionDate,
        day: candidate.day,
        name: candidate.templateLesson.name,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        subjectId: candidate.templateLesson.subjectId,
        classId: candidate.templateLesson.classId,
        teacherId: candidate.templateLesson.teacherId,
        roomId: candidate.templateLesson.roomId,
        deliveryMode: candidate.templateLesson.deliveryMode,
        meetingUrl:
          candidate.templateLesson.deliveryMode === LessonDeliveryMode.ONLINE
            ? candidate.templateLesson.meetingUrl
            : null,
        meetingLabel:
          candidate.templateLesson.deliveryMode === LessonDeliveryMode.ONLINE
            ? candidate.templateLesson.meetingLabel
            : null,
      });

      createOccurrenceIndex += 1;

      if (batch.length >= batchSize) {
        const res = await tx.lessonSession.createMany({
          data: batch,
          skipDuplicates: true,
        });
        insertedCount += res.count;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const res = await tx.lessonSession.createMany({
        data: batch,
        skipDuplicates: true,
      });
      insertedCount += res.count;
    }
  });

  return {
    requestId,
    termId,
    scope,
    summary: {
      totalCandidates,
      createdCount: insertedCount,
      conflictedCount,
      skippedByReason,
    },
    conflicts,
  };
}

