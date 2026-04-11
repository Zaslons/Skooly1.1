/**
 * Bell schedule (`Period`) — pure validation rules for time-of-day blocks per school.
 * Times are compared using the **local** clock (consistent with `createLesson` validation in actions).
 */

import type { PrismaClient } from "@prisma/client";

export type PeriodTimeSlice = {
  id: string;
  name?: string;
  startTime: Date;
  endTime: Date;
};

export type PeriodWithOrder = PeriodTimeSlice & { order: number };

export class BellPeriodError extends Error {
  constructor(
    public code: "INVALID_RANGE" | "PERIOD_OVERLAP" | "OUTSIDE_DEFAULT_SCHOOL_HOURS" | "INVALID_SPAN",
    message: string
  ) {
    super(message);
    this.name = "BellPeriodError";
  }
}

/** Milliseconds since local midnight for a Date (ignores calendar date). */
export function timeOfDayMsLocal(d: Date): number {
  return (
    d.getHours() * 3600000 +
    d.getMinutes() * 60000 +
    d.getSeconds() * 1000 +
    d.getMilliseconds()
  );
}

/**
 * Two [start, end) intervals on the same conceptual school day overlap if they share any positive duration.
 * Requires end > start for each interval (caller should validate range first).
 */
export function periodIntervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  const as = timeOfDayMsLocal(aStart);
  const ae = timeOfDayMsLocal(aEnd);
  const bs = timeOfDayMsLocal(bStart);
  const be = timeOfDayMsLocal(bEnd);
  if (ae <= as || be <= bs) return false;
  return as < be && ae > bs;
}

export function assertStartBeforeEnd(startTime: Date, endTime: Date): void {
  if (timeOfDayMsLocal(endTime) <= timeOfDayMsLocal(startTime)) {
    throw new BellPeriodError("INVALID_RANGE", "End time must be after start time for the same school day.");
  }
}

/**
 * v1: candidate must not overlap any other period (same school list), optionally excluding one id (update).
 */
export function assertPeriodDoesNotOverlapOthers(
  candidate: { startTime: Date; endTime: Date },
  others: PeriodTimeSlice[],
  excludeId?: string
): void {
  assertStartBeforeEnd(candidate.startTime, candidate.endTime);
  for (const o of others) {
    if (excludeId && o.id === excludeId) continue;
    assertStartBeforeEnd(o.startTime, o.endTime);
    if (periodIntervalsOverlap(candidate.startTime, candidate.endTime, o.startTime, o.endTime)) {
      const label = o.name ? `"${o.name}"` : o.id;
      throw new BellPeriodError("PERIOD_OVERLAP", `This time range overlaps with period ${label}.`);
    }
  }
}

/** Default “school day” window used elsewhere in the app (lessons / exam templates). */
const DEFAULT_WORK_START_HOUR = 8;
const DEFAULT_WORK_END_HOUR = 17;

/**
 * Optional guard: period must fall entirely inside [08:00, 17:00] local (same as legacy lesson checks).
 * Call from API when creating/updating if you want parity with existing behavior.
 */
export function assertPeriodWithinDefaultSchoolHours(startTime: Date, endTime: Date): void {
  const s = timeOfDayMsLocal(startTime);
  const e = timeOfDayMsLocal(endTime);
  const dayStart = DEFAULT_WORK_START_HOUR * 3600000;
  const dayEnd = DEFAULT_WORK_END_HOUR * 3600000;
  if (s < dayStart || e > dayEnd) {
    throw new BellPeriodError(
      "OUTSIDE_DEFAULT_SCHOOL_HOURS",
      `Bell period must fall within ${DEFAULT_WORK_START_HOUR}:00–${DEFAULT_WORK_END_HOUR}:00 (local), matching default lesson hours.`
    );
  }
}

/** Weekly template slot: lesson form vs exam template (affects user-facing error copy only). */
export type BellPolicySlotKind = "lesson" | "examTemplate";

/**
 * Same rule as legacy `createLesson` / `updateLesson` checks: weekday template times must fall in
 * [08:00, 17:00] local, with end at exactly 17:00 allowed.
 */
export function assertLessonFitsDefaultWorkingHoursWindow(
  lessonStart: Date,
  lessonEnd: Date,
  options?: { slotKind?: BellPolicySlotKind }
): void {
  const slotKind = options?.slotKind ?? "lesson";
  const label = slotKind === "examTemplate" ? "Exam template" : "Lesson";

  if (timeOfDayMsLocal(lessonEnd) <= timeOfDayMsLocal(lessonStart)) {
    throw new BellPeriodError("INVALID_RANGE", `${label} end time must be after start time.`);
  }
  const lessonStartHour = lessonStart.getHours();
  const lessonEndHour = lessonEnd.getHours();
  const lessonEndMinutes = lessonEnd.getMinutes();
  const isWithinDefaultHours =
    lessonStartHour >= DEFAULT_WORK_START_HOUR &&
    (lessonEndHour < DEFAULT_WORK_END_HOUR ||
      (lessonEndHour === DEFAULT_WORK_END_HOUR && lessonEndMinutes === 0));
  if (!isWithinDefaultHours) {
    throw new BellPeriodError(
      "OUTSIDE_DEFAULT_SCHOOL_HOURS",
      `${label} time is outside default working hours (${DEFAULT_WORK_START_HOUR}:00 - ${DEFAULT_WORK_END_HOUR}:00 for weekdays).`
    );
  }
}

/**
 * Copy a period’s time-of-day onto the anchor’s calendar date (weekly `Lesson` templates use an arbitrary date).
 */
export function mergePeriodTimesOntoAnchor(
  anchor: Date,
  period: { startTime: Date; endTime: Date }
): { startTime: Date; endTime: Date } {
  const startTime = new Date(anchor);
  startTime.setHours(
    period.startTime.getHours(),
    period.startTime.getMinutes(),
    period.startTime.getSeconds(),
    period.startTime.getMilliseconds()
  );
  const endTime = new Date(anchor);
  endTime.setHours(
    period.endTime.getHours(),
    period.endTime.getMinutes(),
    period.endTime.getSeconds(),
    period.endTime.getMilliseconds()
  );
  assertStartBeforeEnd(startTime, endTime);
  return { startTime, endTime };
}

/**
 * Compute lesson times from a span of consecutive periods (first period start → last period end).
 */
export function computeLessonTimesFromPeriodSpan(
  anchor: Date,
  startPeriod: { startTime: Date; endTime: Date },
  endPeriod: { startTime: Date; endTime: Date }
): { startTime: Date; endTime: Date } {
  const startTime = new Date(anchor);
  startTime.setHours(
    startPeriod.startTime.getHours(),
    startPeriod.startTime.getMinutes(),
    startPeriod.startTime.getSeconds(),
    startPeriod.startTime.getMilliseconds()
  );
  const endTime = new Date(anchor);
  endTime.setHours(
    endPeriod.endTime.getHours(),
    endPeriod.endTime.getMinutes(),
    endPeriod.endTime.getSeconds(),
    endPeriod.endTime.getMilliseconds()
  );
  assertStartBeforeEnd(startTime, endTime);
  return { startTime, endTime };
}

/**
 * Load and validate a contiguous period span. Throws BellPeriodError if invalid.
 * Requires: same school, not archived, start.order <= end.order, no gaps in order.
 */
export async function getContiguousPeriodRange(
  schoolId: string,
  startPeriodId: string,
  endPeriodId: string,
  prisma: PrismaClient
): Promise<{ startPeriod: PeriodWithOrder; endPeriod: PeriodWithOrder; periods: PeriodWithOrder[] }> {
  const [startPeriod, endPeriod] = await Promise.all([
    prisma.period.findFirst({
      where: { id: startPeriodId, schoolId, isArchived: false },
      select: { id: true, name: true, startTime: true, endTime: true, order: true },
    }),
    prisma.period.findFirst({
      where: { id: endPeriodId, schoolId, isArchived: false },
      select: { id: true, name: true, startTime: true, endTime: true, order: true },
    }),
  ]);

  if (!startPeriod || !endPeriod) {
    throw new BellPeriodError("INVALID_SPAN", "One or both periods not found or archived.");
  }
  if (startPeriod.order > endPeriod.order) {
    throw new BellPeriodError("INVALID_SPAN", "Start period must come before or equal to end period.");
  }

  const allInRange = await prisma.period.findMany({
    where: {
      schoolId,
      isArchived: false,
      order: { gte: startPeriod.order, lte: endPeriod.order },
    },
    orderBy: { order: "asc" },
    select: { id: true, name: true, startTime: true, endTime: true, order: true },
  });

  const expectedCount = endPeriod.order - startPeriod.order + 1;
  if (allInRange.length !== expectedCount) {
    throw new BellPeriodError(
      "INVALID_SPAN",
      "Period span has gaps in order. All periods between start and end must exist and be contiguous."
    );
  }

  const periods: PeriodWithOrder[] = allInRange.map((p) => ({
    id: p.id,
    name: p.name,
    startTime: new Date(p.startTime),
    endTime: new Date(p.endTime),
    order: p.order,
  }));

  return {
    startPeriod: periods[0]!,
    endPeriod: periods[periods.length - 1]!,
    periods,
  };
}

/**
 * Validate a lesson period span. Throws BellPeriodError if invalid.
 */
export async function validateLessonPeriodSpan(
  schoolId: string,
  startPeriodId: string,
  endPeriodId: string,
  prisma: PrismaClient
): Promise<void> {
  await getContiguousPeriodRange(schoolId, startPeriodId, endPeriodId, prisma);
}

/**
 * True if [lessonStart, lessonEnd] exactly matches the merged span of startPeriod..endPeriod (by time-of-day).
 */
export function lessonIntervalMatchesPeriodSpan(
  lessonStart: Date,
  lessonEnd: Date,
  startPeriod: { startTime: Date; endTime: Date },
  endPeriod: { startTime: Date; endTime: Date }
): boolean {
  const ls = timeOfDayMsLocal(lessonStart);
  const le = timeOfDayMsLocal(lessonEnd);
  const ps = timeOfDayMsLocal(startPeriod.startTime);
  const pe = timeOfDayMsLocal(endPeriod.endTime);
  return ls === ps && le === pe;
}

/**
 * True if [lessonStart, lessonEnd] in local time-of-day lies entirely inside at least one period's interval.
 */
export function lessonIntervalContainedInSomeActivePeriod(
  lessonStart: Date,
  lessonEnd: Date,
  periods: PeriodTimeSlice[]
): boolean {
  if (timeOfDayMsLocal(lessonEnd) <= timeOfDayMsLocal(lessonStart)) {
    return false;
  }
  for (const p of periods) {
    const ps = timeOfDayMsLocal(p.startTime);
    const pe = timeOfDayMsLocal(p.endTime);
    if (pe <= ps) continue;
    const ls = timeOfDayMsLocal(lessonStart);
    const le = timeOfDayMsLocal(lessonEnd);
    if (ls >= ps && le <= pe) {
      return true;
    }
  }
  return false;
}

/**
 * When the school has **no** active bell periods: enforce legacy 8–17 window.
 * When it has **one or more** active periods: require the interval to fit **entirely inside one** of them.
 * Use `slotKind: "examTemplate"` for weekly exam templates (copy only).
 */
export function validateLessonTimesAgainstBellPolicy(
  lessonStart: Date,
  lessonEnd: Date,
  activePeriods: PeriodTimeSlice[],
  options?: {
    slotKind?: BellPolicySlotKind;
    /** When set, accept if interval matches this span (multi-period lessons). */
    periodSpan?: { startPeriod: PeriodTimeSlice; endPeriod: PeriodTimeSlice };
  }
): void {
  const slotKind = options?.slotKind ?? "lesson";
  if (activePeriods.length === 0) {
    assertLessonFitsDefaultWorkingHoursWindow(lessonStart, lessonEnd, { slotKind });
    return;
  }
  if (options?.periodSpan && lessonIntervalMatchesPeriodSpan(lessonStart, lessonEnd, options.periodSpan.startPeriod, options.periodSpan.endPeriod)) {
    return;
  }
  if (lessonIntervalContainedInSomeActivePeriod(lessonStart, lessonEnd, activePeriods)) {
    return;
  }
  const noPeriodMsg =
    slotKind === "examTemplate"
      ? "Exam template time must fall entirely within one active bell period, or adjust start/end to match a period."
      : "Lesson time must fall entirely within one active bell period, or select a bell period in the form.";
  throw new BellPeriodError("OUTSIDE_DEFAULT_SCHOOL_HOURS", noPeriodMsg);
}
