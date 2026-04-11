import prisma from "@/lib/prisma";
import {
  CalendarExceptionType,
  ExamCategory,
  LessonDeliveryMode,
  LessonSessionStatus,
} from "@prisma/client";

export type CalendarInstanceEventDTO = {
  id: string;
  kind: "lesson_session" | "exam" | "overlay";
  title: string;
  start: string;
  end: string;
  display?: "background" | "auto";
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps: Record<string, unknown>;
};

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayEnd(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function sameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * E5: unified calendar payload — lesson instances, exams, calendar overlays, assignment hints.
 */
export async function getCalendarInstancesForRange(params: {
  schoolId: string;
  rangeStart: Date;
  rangeEnd: Date;
  teacherId?: string;
  classId?: number;
}): Promise<CalendarInstanceEventDTO[]> {
  const { schoolId, rangeStart, rangeEnd, teacherId, classId } = params;

  const events: CalendarInstanceEventDTO[] = [];

  const sessions = await prisma.lessonSession.findMany({
    where: {
      schoolId,
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
      ...(classId != null ? { classId } : {}),
      ...(teacherId
        ? {
            OR: [{ teacherId }, { substituteTeacherId: teacherId }],
          }
        : {}),
    },
    include: {
      subject: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true, surname: true } },
      substituteTeacher: { select: { id: true, name: true, surname: true } },
      room: { select: { id: true, name: true } },
      overrideRoom: { select: { id: true, name: true } },
      templateLesson: { select: { id: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const templateIds = Array.from(new Set(sessions.map((s) => s.templateLessonId)));

  const assignments =
    templateIds.length === 0
      ? []
      : await prisma.assignment.findMany({
          where: {
            schoolId,
            dueLessonId: { in: templateIds },
            dueDate: { gte: rangeStart, lte: rangeEnd },
          },
          select: { id: true, title: true, dueLessonId: true, dueDate: true },
        });

  const examsInRange = await prisma.exam.findMany({
    where: {
      schoolId,
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
    },
    include: {
      lesson: {
        select: {
          id: true,
          classId: true,
          teacherId: true,
          subject: { select: { name: true } },
          class: { select: { name: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  const examsFiltered = examsInRange.filter((ex) => {
    if (classId != null && ex.lesson && ex.lesson.classId !== classId) return false;
    if (teacherId) {
      if (!ex.lesson) return false;
      return ex.lesson.teacherId === teacherId;
    }
    return true;
  });

  for (const s of sessions) {
    const effectiveTeacher = s.substituteTeacher ?? s.teacher;
    const effectiveRoom = s.overrideRoom ?? s.room;
    const assignOnDay = assignments.filter(
      (a) =>
        a.dueLessonId === s.templateLessonId &&
        sameCalendarDay(new Date(a.dueDate), s.sessionDate)
    );

    const linkedExams = examsFiltered.filter(
      (ex) =>
        ex.lessonId === s.templateLessonId &&
        sameCalendarDay(new Date(ex.startTime), s.sessionDate)
    );
    const popQuizzesOnDay = linkedExams.filter((ex) => ex.examCategory === ExamCategory.POP_QUIZ);

    const isCancelled = s.status === LessonSessionStatus.CANCELLED;
    const isOnline = s.deliveryMode === LessonDeliveryMode.ONLINE;

    events.push({
      id: `ls-${s.id}`,
      kind: "lesson_session",
      title: isCancelled
        ? `[Cancelled] ${s.subject.name} (${s.class.name})`
        : `${s.subject.name} (${s.class.name})`,
      start: s.startTime.toISOString(),
      end: s.endTime.toISOString(),
      backgroundColor: isCancelled
        ? "#9ca3af"
        : isOnline
          ? "#4f46e5"
          : "#2563eb",
      borderColor: isCancelled ? "#6b7280" : isOnline ? "#4338ca" : "#1d4ed8",
      textColor: "#ffffff",
      extendedProps: {
        kind: "lesson_session",
        deliveryMode: s.deliveryMode,
        lessonSessionId: s.id,
        templateLessonId: s.templateLessonId,
        status: s.status,
        day: s.day,
        subjectId: s.subjectId,
        classId: s.classId,
        subjectName: s.subject.name,
        className: s.class.name,
        teacherId: s.teacherId,
        teacherName: `${s.teacher.name} ${s.teacher.surname}`,
        substituteTeacherId: s.substituteTeacherId,
        substituteTeacherName: s.substituteTeacher
          ? `${s.substituteTeacher.name} ${s.substituteTeacher.surname}`
          : null,
        effectiveTeacherName: `${effectiveTeacher.name} ${effectiveTeacher.surname}`,
        roomId: s.roomId,
        roomName: s.room?.name ?? null,
        overrideRoomId: s.overrideRoomId,
        effectiveRoomName: effectiveRoom?.name ?? null,
        instanceNotes: s.instanceNotes,
        lastOverrideReason: s.lastOverrideReason,
        meetingUrl: s.meetingUrl,
        meetingLabel: s.meetingLabel,
        assignmentDue: assignOnDay.map((a) => ({ id: a.id, title: a.title })),
        linkedExamIds: linkedExams.map((e) => e.id),
        examsOnTemplate: linkedExams.map((e) => ({ id: e.id, title: e.title })),
        popQuizzes: popQuizzesOnDay.map((e) => ({
          id: e.id,
          durationMinutes: e.durationMinutes,
          title: e.title,
        })),
      },
    });
  }

  for (const ex of examsFiltered) {
    const isRecurring = ex.isRecurring;
    events.push({
      id: `ex-${ex.id}`,
      kind: "exam",
      title: ex.title || "Exam",
      start: ex.startTime.toISOString(),
      end: ex.endTime.toISOString(),
      backgroundColor: isRecurring ? "#facc15" : "#dc2626",
      borderColor: isRecurring ? "#ca8a04" : "#991b1b",
      textColor: "#111827",
      extendedProps: {
        kind: "exam",
        examId: ex.id,
        durationMinutes: ex.durationMinutes,
        isRecurring,
        lessonId: ex.lessonId,
        className: ex.lesson?.class.name ?? null,
        subjectName: ex.lesson?.subject.name ?? null,
      },
    });
  }

  const overlays = await prisma.schoolCalendarException.findMany({
    where: {
      schoolId,
      type: { in: [CalendarExceptionType.HOLIDAY, CalendarExceptionType.BREAK, CalendarExceptionType.EXAM_PERIOD] },
      startDate: { lte: rangeEnd },
      endDate: { gte: rangeStart },
    },
    select: {
      id: true,
      title: true,
      type: true,
      startDate: true,
      endDate: true,
    },
  });

  const slotStartH = 8;
  const slotEndH = 17;

  for (const ov of overlays) {
    const ovStart = dayStart(new Date(ov.startDate));
    const ovEnd = dayEnd(new Date(ov.endDate));
    const rangeS = dayStart(rangeStart);
    const rangeE = dayEnd(rangeEnd);
    const iterStart = rangeS > ovStart ? rangeS : ovStart;
    const iterEnd = rangeE < ovEnd ? rangeE : ovEnd;

    const cursor = new Date(iterStart);
    while (cursor <= iterEnd) {
      const day = dayStart(new Date(cursor));
      if (day < ovStart || day > ovEnd) {
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      const dayS = new Date(day);
      dayS.setHours(slotStartH, 0, 0, 0);
      const dayE = new Date(day);
      dayE.setHours(slotEndH, 0, 0, 0);

      const label =
        ov.type === CalendarExceptionType.HOLIDAY
          ? `Holiday: ${ov.title}`
          : ov.type === CalendarExceptionType.BREAK
            ? `Break: ${ov.title}`
            : `Exam period: ${ov.title}`;
      const rangeLabel = `${new Date(ov.startDate).toLocaleDateString()} - ${new Date(ov.endDate).toLocaleDateString()}`;

      events.push({
        id: `ov-${ov.id}-${day.toISOString().slice(0, 10)}`,
        kind: "overlay",
        title: `${label} (${rangeLabel})`,
        start: dayS.toISOString(),
        end: dayE.toISOString(),
        display: "background",
        backgroundColor:
          ov.type === CalendarExceptionType.EXAM_PERIOD ? "#e5e7eb" : "#d1d5db",
        extendedProps: {
          kind: "overlay",
          overlayType: ov.type,
          exceptionId: ov.id,
          overlayTitle: ov.title,
          overlayRangeStart: ov.startDate.toISOString(),
          overlayRangeEnd: ov.endDate.toISOString(),
        },
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return events;
}
