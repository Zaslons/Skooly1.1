import type { Day } from "@prisma/client";
import moment from "moment-timezone";

/** JS Sunday=0 … Saturday=6 — matches `Date#getDay()` in local interpretation; template times use UTC getters. */
const PRISMA_DAY_TO_JS: Record<Day, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/** Match `parseTemplateTimeOfDay` in termLessonGenerationRules (floating UTC clock on templates). */
export function parseWallClockUtcMinutes(d: Date): { h: number; m: number } {
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

/**
 * One reference calendar day for `day` in `ianaTz`, aligned with weekly lesson templates.
 * Uses a fixed week so comparisons are stable across calls.
 */
function anchorMomentForPrismaDay(day: Day, ianaTz: string): moment.Moment {
  const targetDow = PRISMA_DAY_TO_JS[day];
  const base = moment.tz("2024-01-01", ianaTz).startOf("day");
  const curDow = base.day();
  const diff = (targetDow - curDow + 7) % 7;
  return base.clone().add(diff, "days");
}

/**
 * Weekly recurring lesson window as absolute UTC millisecond range, interpreted in the school's IANA timezone.
 */
export function weeklyLessonUtcRangeMs(
  day: Day,
  startTime: Date,
  endTime: Date,
  ianaTz: string
): { startMs: number; endMs: number } {
  const anchor = anchorMomentForPrismaDay(day, ianaTz);
  const { h: h1, m: m1 } = parseWallClockUtcMinutes(startTime);
  const { h: h2, m: m2 } = parseWallClockUtcMinutes(endTime);
  const start = anchor.clone().hour(h1).minute(m1).second(0).millisecond(0);
  let end = anchor.clone().hour(h2).minute(m2).second(0).millisecond(0);
  if (end.valueOf() <= start.valueOf()) {
    end = end.add(1, "day");
  }
  return { startMs: start.valueOf(), endMs: end.valueOf() };
}

export function utcRangesOverlap(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number }
): boolean {
  return a.startMs < b.endMs && a.endMs > b.startMs;
}
