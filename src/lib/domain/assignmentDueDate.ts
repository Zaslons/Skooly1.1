import { Day } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSchedulingReadiness } from "@/lib/domain/temporalRules";

export function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/** Map Prisma `Day` to JS `Date#getDay()` (0 = Sunday … 6 = Saturday). */
export function prismaDayToJsWeekday(d: Day): number {
  const map: Record<Day, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
  };
  return map[d];
}

/**
 * First calendar instant on or after `from` (inclusive, comparing dates only for day match)
 * where the weekday matches `lessonDay`, with clock time taken from `lessonStartTime`.
 * Returns null if none found before `rangeEnd`.
 */
export function nextDueInstantForLesson(
  from: Date,
  rangeEnd: Date,
  lessonDay: Day,
  lessonStartTime: Date
): Date | null {
  const targetWd = prismaDayToJsWeekday(lessonDay);
  const end = new Date(rangeEnd);
  end.setHours(23, 59, 59, 999);
  const cur = dayStart(from);
  for (let i = 0; i < 370; i++) {
    if (cur.getDay() === targetWd) {
      const out = new Date(cur);
      out.setHours(
        lessonStartTime.getHours(),
        lessonStartTime.getMinutes(),
        lessonStartTime.getSeconds(),
        lessonStartTime.getMilliseconds()
      );
      if (out >= from && out <= end) {
        return out;
      }
    }
    cur.setDate(cur.getDate() + 1);
    if (cur > end) break;
  }
  return null;
}

/**
 * E6: derive legacy `dueDate` from the weekly due lesson + active term window (first matching slot on/after start).
 */
export async function computeDueDateForAssignment(params: {
  schoolId: string;
  dueLessonId: number;
  startDate: Date;
}): Promise<Date> {
  const { schoolId, dueLessonId, startDate } = params;
  const lesson = await prisma.lesson.findUnique({
    where: { id: dueLessonId, schoolId },
    select: { day: true, startTime: true },
  });
  if (!lesson) {
    throw new Error("Due lesson not found for this school.");
  }

  const readiness = await getSchedulingReadiness(schoolId);
  const term = readiness.activeTermId
    ? await prisma.term.findUnique({
        where: { id: readiness.activeTermId, schoolId },
        select: { startDate: true, endDate: true },
      })
    : null;

  const rangeStart = term ? maxDate(dayStart(term.startDate), dayStart(startDate)) : dayStart(startDate);
  const rangeEnd = term ? term.endDate : new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);

  const instant = nextDueInstantForLesson(rangeStart, rangeEnd, lesson.day, lesson.startTime);
  return instant ?? startDate;
}
