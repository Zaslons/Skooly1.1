import prisma from "@/lib/prisma";
import crypto from "crypto";
import { CalendarExceptionType, Day } from "@prisma/client";
import type { RecurringExamsPayload } from "@/lib/formValidationSchemas";

type SetupStrictMode = boolean;

export type RecurringExamLoopPreviewStatus = "create" | "skip" | "conflict";

export type RecurringExamLessonResolution = {
  lessonId: number;
  classId: number;
  subjectId: number;
  teacherId: string;
  roomId: number | null;
};

export type RecurringExamTemplateKey = {
  day: Day;
  // These include a deterministic date component based on the occurrence.
  // That makes template lookup idempotent across repeated preview/commit runs.
  startTime: Date;
  endTime: Date;
  classId: number;
  subjectId: number;
  teacherId: string | null;
  roomId: number | null;
};

export type RecurringExamOccurrencePreview = {
  weekIndex: number;
  occurrenceIndex: number;

  day: Day;
  startTime: Date;
  endTime: Date;

  status: RecurringExamLoopPreviewStatus;
  reason?: string;

  // For "create"/conflict dedupe + for mapping into Exam.lesson relation.
  resolvedLesson?: RecurringExamLessonResolution;

  // Commit uses this to create ExamTemplate + Exam rows deterministically.
  templateKey?: RecurringExamTemplateKey;
};

export type RecurringExamPreviewResult = {
  requestId: string;
  termId: string;
  groupedByWeekIndex: Record<number, RecurringExamOccurrencePreview[]>;
  summary: {
    wouldCreate: number;
    skipped: number;
    conflicted: number;
    conflictReasons: Record<string, number>;
  };
};

const JS_DOW_BY_PRISMA_DAY: Record<Day, number> = {
  [Day.MONDAY]: 1,
  [Day.TUESDAY]: 2,
  [Day.WEDNESDAY]: 3,
  [Day.THURSDAY]: 4,
  [Day.FRIDAY]: 5,
  [Day.SATURDAY]: 6,
  [Day.SUNDAY]: 0,
};

function parseTimeOfDayHHMM(hhmm: string): { hours: number; minutes: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

function cloneDatePreserveMs(date: Date) {
  return new Date(date.getTime());
}

function setTimeOfDay(date: Date, hours: number, minutes: number) {
  const d = cloneDatePreserveMs(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = cloneDatePreserveMs(date);
  d.setDate(d.getDate() + days);
  return d;
}

function deterministicRequestId(payload: Omit<RecurringExamsPayload, "loops"> & { loops: unknown }) {
  // JSON stringify is deterministic given we construct object in fixed order.
  const input = JSON.stringify(payload);
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

async function resolveLessonForLoopItem(params: {
  schoolId: string;
  day: Day;
  classId: number;
  subjectId: number;
  startTimeHHMM: string;
  durationMinutes: number;
  teacherId?: string | null;
  roomId?: number | null;
}): Promise<RecurringExamLessonResolution | { conflictReason: string }> {
  const {
    schoolId,
    day,
    classId,
    subjectId,
    startTimeHHMM,
    durationMinutes,
    teacherId,
    roomId,
  } = params;

  // Lesson.startTime/endTime are full DateTime values in DB, but time-of-day
  // matches our loop based on HH:MM and duration.
  const { hours, minutes } = parseTimeOfDayHHMM(startTimeHHMM);
  const candidateLessons = await prisma.lesson.findMany({
    where: {
      schoolId,
      day,
      classId,
      subjectId,
    },
    select: {
      id: true,
      teacherId: true,
      roomId: true,
      startTime: true,
      endTime: true,
    },
  });

  const matches = candidateLessons.filter((l) => {
    const stH = l.startTime.getHours();
    const stM = l.startTime.getMinutes();
    const lDurationMin = Math.round((l.endTime.getTime() - l.startTime.getTime()) / 60000);

    if (stH !== hours || stM !== minutes) return false;
    if (lDurationMin !== durationMinutes) return false;

    if (teacherId && teacherId !== l.teacherId) return false;
    if (roomId !== undefined && roomId !== null && l.roomId !== roomId) return false;

    return true;
  });

  if (matches.length === 0) return { conflictReason: "NO_LESSON_TEMPLATE" };
  if (matches.length > 1) return { conflictReason: "AMBIGUOUS_LESSON" };

  const resolved = matches[0];
  return {
    lessonId: resolved.id,
    classId,
    subjectId,
    teacherId: resolved.teacherId,
    roomId: resolved.roomId ?? null,
  };
}

async function fetchTerm(startTermId: string, schoolId: string) {
  return prisma.term.findFirst({
    where: { id: startTermId, schoolId },
    select: { id: true, startDate: true, endDate: true, schoolId: true },
  });
}

function exceptionOverlapsOccurrence(params: {
  occStart: Date;
  occEnd: Date;
  excStart: Date;
  excEnd: Date;
}): boolean {
  const { occStart, occEnd, excStart, excEnd } = params;
  return occStart < excEnd && occEnd > excStart;
}

function pickExceptionReason(type: CalendarExceptionType): string {
  switch (type) {
    case CalendarExceptionType.HOLIDAY:
      return "EXCEPTION_HOLIDAY";
    case CalendarExceptionType.BREAK:
      return "EXCEPTION_BREAK";
    case CalendarExceptionType.EXAM_PERIOD:
      return "EXCEPTION_EXAM_PERIOD";
    default:
      return "EXCEPTION_CALENDAR";
  }
}

export async function expandRecurringExamLoops(params: {
  schoolId: string;
  payload: RecurringExamsPayload;
  requestId: string;
}): Promise<RecurringExamPreviewResult> {
  const { schoolId, payload, requestId } = params;

  const term = await fetchTerm(payload.termId, schoolId);
  if (!term) {
    // Let API layer map to TemporalRuleError if needed; for now deterministic.
    throw new Error("TERM_NOT_FOUND");
  }

  const { loops } = payload;

  // Preload term exceptions (HOLIDAY/BREAK/EXAM_PERIOD).
  const exceptions = await prisma.schoolCalendarException.findMany({
    where: {
      schoolId,
      termId: term.id,
      type: {
        in: [CalendarExceptionType.HOLIDAY, CalendarExceptionType.BREAK, CalendarExceptionType.EXAM_PERIOD],
      },
    },
    select: { id: true, type: true, startDate: true, endDate: true },
    orderBy: [{ startDate: "asc" }],
  });

  // Compute occurrence datetimes first (so we can query existing exams once).
  const occurrences: Array<{
    weekIndex: number;
    occurrenceIndex: number;
    loopItem: (typeof loops)[number];
    day: Day;
    startTime: Date;
    endTime: Date;
    exceptionReason?: string;
    outsideTerm?: boolean;
  }> = [];

  for (let i = 0; i < loops.length; i++) {
    const item = loops[i];

    const baseWeekStart = addDays(new Date(term.startDate), item.weekIndex * 7);
    const baseDow = baseWeekStart.getDay(); // 0..6
    const targetDow = JS_DOW_BY_PRISMA_DAY[item.day];
    const offsetWithinWeek = (targetDow - baseDow + 7) % 7;
    const occurrenceDate = addDays(baseWeekStart, offsetWithinWeek);

    const { hours, minutes } = parseTimeOfDayHHMM(item.startTime);
    const occStart = setTimeOfDay(occurrenceDate, hours, minutes);
    const occEnd = new Date(occStart.getTime() + item.durationMinutes * 60 * 1000);

    const outsideTerm = occStart < term.startDate || occEnd > term.endDate;

    // Determine if this occurrence overlaps a term exception.
    const overlappingException = !outsideTerm
      ? exceptions.find((exc) => exceptionOverlapsOccurrence({ occStart, occEnd, excStart: exc.startDate, excEnd: exc.endDate }))
      : undefined;

    const exceptionReason = overlappingException ? pickExceptionReason(overlappingException.type) : undefined;

    occurrences.push({
      weekIndex: item.weekIndex,
      occurrenceIndex: i,
      loopItem: item,
      day: item.day,
      startTime: occStart,
      endTime: occEnd,
      exceptionReason,
      outsideTerm,
    });
  }

  const minStart = occurrences.reduce((acc, o) => (o.startTime < acc ? o.startTime : acc), occurrences[0]?.startTime ?? term.startDate);
  const maxEnd = occurrences.reduce((acc, o) => (o.endTime > acc ? o.endTime : acc), occurrences[0]?.endTime ?? term.endDate);

  // Preload existing exams with lessons to detect overlaps/conflicts + duplicates.
  const existingExams = await prisma.exam.findMany({
    where: {
      schoolId,
      termId: term.id,
      startTime: { lt: maxEnd },
      endTime: { gt: minStart },
    },
    include: {
      lesson: {
        select: {
          id: true,
          classId: true,
          subjectId: true,
          teacherId: true,
          roomId: true,
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  // Deterministic expand + conflict detection.
  const previewByWeekIndex: Record<number, RecurringExamOccurrencePreview[]> = {};
  let wouldCreate = 0;
  let skipped = 0;
  let conflicted = 0;
  const conflictReasons: Record<string, number> = {};
  const addConflictReason = (reason?: string) => {
    if (!reason) return;
    conflictReasons[reason] = (conflictReasons[reason] ?? 0) + 1;
  };

  for (const occ of occurrences) {
    const { weekIndex, occurrenceIndex, loopItem, startTime, endTime, exceptionReason, outsideTerm } = occ;

    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    const pushPreview = (preview: RecurringExamOccurrencePreview) => {
      if (!previewByWeekIndex[weekIndex]) previewByWeekIndex[weekIndex] = [];
      previewByWeekIndex[weekIndex].push(preview);
    };

    // 1) Outside term => skip
    if (outsideTerm) {
      skipped++;
      pushPreview({
        weekIndex,
        occurrenceIndex,
        day: loopItem.day,
        startTime,
        endTime,
        status: "skip",
        reason: "OUTSIDE_TERM",
      });
      continue;
    }

    // 2) Calendar exceptions => conflict (strict mode aborts, lenient mode skips)
    if (exceptionReason) {
      conflicted++;
      addConflictReason(exceptionReason);
      pushPreview({
        weekIndex,
        occurrenceIndex,
        day: loopItem.day,
        startTime,
        endTime,
        status: "conflict",
        reason: exceptionReason,
      });
      continue;
    }

    // 3) Resolve a single Lesson template that matches this configuration.
    const resolved = await resolveLessonForLoopItem({
      schoolId,
      day: loopItem.day,
      classId: loopItem.classId,
      subjectId: loopItem.subjectId,
      startTimeHHMM: loopItem.startTime,
      durationMinutes: loopItem.durationMinutes,
      teacherId: loopItem.teacherId ?? null,
      roomId: loopItem.roomId ?? null,
    });

    if ("conflictReason" in resolved) {
      // NO_LESSON_TEMPLATE or AMBIGUOUS_LESSON: treat as skip or conflict deterministically.
      if (resolved.conflictReason === "NO_LESSON_TEMPLATE") {
        skipped++;
        pushPreview({
          weekIndex,
          occurrenceIndex,
          day: loopItem.day,
          startTime,
          endTime,
          status: "skip",
          reason: "NO_LESSON_TEMPLATE",
        });
        continue;
      }

      conflicted++;
      addConflictReason("AMBIGUOUS_LESSON");
      pushPreview({
        weekIndex,
        occurrenceIndex,
        day: loopItem.day,
        startTime,
        endTime,
        status: "conflict",
        reason: "AMBIGUOUS_LESSON",
      });
      continue;
    }

    const resolvedLesson = resolved;

    // 4) Exact duplicate detection:
    // If an existing Exam already occupies the exact slot for the same lesson,
    // treat it as "already exists" (not a conflict), enabling idempotent re-commit.
    const duplicate = existingExams.find((e) => {
      if (!e.lesson) return false;
      if (e.startTime.getTime() !== startMs) return false;
      if (e.endTime.getTime() !== endMs) return false;
      return e.lesson.id === resolvedLesson.lessonId;
    });

    if (duplicate) {
      skipped++;
      pushPreview({
        weekIndex,
        occurrenceIndex,
        day: loopItem.day,
        startTime,
        endTime,
        status: "skip",
        reason: "ALREADY_EXISTS",
        resolvedLesson,
      });
      continue;
    }

    // 5) Overlap-based conflicts.
    const overlapping = existingExams.filter((e) => {
      const es = e.startTime.getTime();
      const ee = e.endTime.getTime();
      return startMs < ee && endMs > es;
    });

    // We only classify conflicts when we can resolve class/teacher/room from existing exam.lesson.
    let conflictReason: string | undefined;
    const conflictParts: string[] = [];

    for (const e of overlapping) {
      const exLesson = e.lesson;
      if (!exLesson) continue;

      const classConflict = exLesson.classId === resolvedLesson.classId;
      const teacherConflict = exLesson.teacherId === resolvedLesson.teacherId;
      const roomConflict =
        resolvedLesson.roomId !== null && exLesson.roomId !== null && exLesson.roomId === resolvedLesson.roomId;

      if (classConflict) conflictParts.push("CLASS_CONFLICT");
      else if (roomConflict) conflictParts.push("ROOM_CONFLICT");
      else if (teacherConflict) conflictParts.push("TEACHER_CONFLICT");
    }

    // Deterministic reason: pick unique parts and order them.
    const distinctParts = Array.from(new Set(conflictParts)).sort();
    if (distinctParts.length > 0) {
      conflicted++;
      conflictReason = distinctParts.join("+");
      addConflictReason(conflictReason);
      pushPreview({
        weekIndex,
        occurrenceIndex,
        day: loopItem.day,
        startTime,
        endTime,
        status: "conflict",
        reason: conflictReason,
        resolvedLesson,
      });
      continue;
    }

    // 6) It's safe to create.
    wouldCreate++;

    pushPreview({
      weekIndex,
      occurrenceIndex,
      day: loopItem.day,
      startTime,
      endTime,
      status: "create",
      resolvedLesson,
      reason: undefined,
      templateKey: {
        day: loopItem.day,
        startTime: startTime,
        endTime: endTime,
        classId: loopItem.classId,
        subjectId: loopItem.subjectId,
        teacherId: loopItem.teacherId ?? resolvedLesson.teacherId,
        roomId: loopItem.roomId ?? resolvedLesson.roomId,
      },
    });
  }

  // Ensure stable ordering within each week by occurrenceIndex.
  for (const weekIndexStr of Object.keys(previewByWeekIndex)) {
    const weekIndex = Number(weekIndexStr);
    previewByWeekIndex[weekIndex] = (previewByWeekIndex[weekIndex] ?? []).sort(
      (a, b) => a.occurrenceIndex - b.occurrenceIndex
    );
  }

  return {
    requestId,
    termId: term.id,
    groupedByWeekIndex: previewByWeekIndex,
    summary: { wouldCreate, skipped, conflicted, conflictReasons },
  };
}

