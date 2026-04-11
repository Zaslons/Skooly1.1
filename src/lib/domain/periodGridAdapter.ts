import type { ScheduleEvent } from "@/components/BigCalender";

export type PeriodGridPeriod = {
  id: string;
  order: number;
  name: string;
  startTime: Date;
  endTime: Date;
  startTimeLabel: string;
  endTimeLabel: string;
};

export type PeriodGridDay = {
  key: string;
  date: Date;
  labelShort: string;
  labelLong: string;
};

export type PeriodGridException = {
  exceptionId: string;
  type: "HOLIDAY" | "BREAK" | "EXAM_PERIOD";
  title: string;
  startIso?: string;
  endIso?: string;
};

export type PeriodGridCell = {
  cellId: string;
  dayKey: string;
  periodId: string;
  /** All lesson sessions overlapping this period (same slot can hold multiple classes). */
  lessons: ScheduleEvent[];
  lessonSpanLength: number;
  lessonIsSpanStart: boolean;
  lessonIsContinuation: boolean;
  lessonSpanParentCellId?: string;
  exams: ScheduleEvent[];
  chips: Array<{ kind: "POP_QUIZ" | "ASSIGNMENT_DUE"; label: string; count: number }>;
  exceptions: PeriodGridException[];
  state: "empty" | "occupied" | "blocked";
};

export type PeriodGridModel = {
  days: PeriodGridDay[];
  periods: PeriodGridPeriod[];
  cellsByKey: Record<string, PeriodGridCell>;
  dayExceptions: Record<string, PeriodGridException[]>;
};

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function atDayTime(day: Date, sourceTime: Date): Date {
  const d = new Date(day);
  d.setHours(sourceTime.getHours(), sourceTime.getMinutes(), sourceTime.getSeconds(), 0);
  return d;
}

function formatTimeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function minuteRangesOverlap(aStartMin: number, aEndMin: number, bStartMin: number, bEndMin: number): boolean {
  return aStartMin < bEndMin && aEndMin > bStartMin;
}

type LessonPlacement = {
  lesson: ScheduleEvent;
  dayKey: string;
  spanStartIndex: number;
  spanLength: number;
};

function placementsOverlapPeriodRange(a: LessonPlacement, b: LessonPlacement): boolean {
  if (a.dayKey !== b.dayKey) return false;
  const aEnd = a.spanStartIndex + a.spanLength;
  const bEnd = b.spanStartIndex + b.spanLength;
  return a.spanStartIndex < bEnd && aEnd > b.spanStartIndex;
}

function canUseRowSpanForPlacement(pl: LessonPlacement, all: LessonPlacement[]): boolean {
  if (pl.spanLength <= 1) return false;
  return !all.some((o) => o !== pl && placementsOverlapPeriodRange(pl, o));
}

function mergeLessonChips(lessons: ScheduleEvent[]): PeriodGridCell["chips"] {
  let pop = 0;
  let asg = 0;
  for (const ls of lessons) {
    const popQuizzes = Array.isArray(ls.extendedProps?.popQuizzes) ? ls.extendedProps.popQuizzes : [];
    const assignmentDue = Array.isArray(ls.extendedProps?.assignmentDue) ? ls.extendedProps.assignmentDue : [];
    pop += popQuizzes.length;
    asg += assignmentDue.length;
  }
  const chips: PeriodGridCell["chips"] = [];
  if (pop > 0) chips.push({ kind: "POP_QUIZ", label: "Pop Quiz", count: pop });
  if (asg > 0) chips.push({ kind: "ASSIGNMENT_DUE", label: "Assignment Due", count: asg });
  return chips;
}

function dedupeLessonsById(lessons: ScheduleEvent[]): ScheduleEvent[] {
  const seen = new Set<string>();
  const out: ScheduleEvent[] = [];
  for (const ls of lessons) {
    const id = String(ls.id ?? "");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(ls);
  }
  return out;
}

function sortLessonsForCell(lessons: ScheduleEvent[]): ScheduleEvent[] {
  return [...lessons].sort((a, b) => {
    const ca = String(a.extendedProps?.className ?? "");
    const cb = String(b.extendedProps?.className ?? "");
    const c = ca.localeCompare(cb);
    if (c !== 0) return c;
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
}

export function buildPeriodGridModel(params: {
  events: ScheduleEvent[];
  periods: Array<{ id: string; order: number; name: string; startTime: string | Date; endTime: string | Date }>;
  rangeStart: Date;
  rangeEnd: Date;
}): PeriodGridModel {
  const { events, periods, rangeStart, rangeEnd } = params;

  const days: PeriodGridDay[] = [];
  const dayCursor = new Date(rangeStart);
  while (dayCursor < rangeEnd) {
    days.push({
      key: dateKey(dayCursor),
      date: new Date(dayCursor),
      labelShort: dayCursor.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      labelLong: dayCursor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    });
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  const normalizedPeriods: PeriodGridPeriod[] = [...periods]
    .sort((a, b) => a.order - b.order)
    .map((p) => {
      const st = new Date(p.startTime);
      const en = new Date(p.endTime);
      return {
        id: p.id,
        order: p.order,
        name: p.name,
        startTime: st,
        endTime: en,
        startTimeLabel: formatTimeLabel(st),
        endTimeLabel: formatTimeLabel(en),
      };
    });

  const cellsByKey: Record<string, PeriodGridCell> = {};
  const dayExceptions: Record<string, PeriodGridException[]> = {};

  for (const d of days) {
    dayExceptions[d.key] = [];
    for (const p of normalizedPeriods) {
      const key = `${d.key}:${p.id}`;
      cellsByKey[key] = {
        cellId: key,
        dayKey: d.key,
        periodId: p.id,
        lessons: [],
        lessonSpanLength: 1,
        lessonIsSpanStart: false,
        lessonIsContinuation: false,
        exams: [],
        chips: [],
        exceptions: [],
        state: "empty",
      };
    }
  }

  const overlays = events.filter((e) => e.extendedProps?.kind === "overlay");
  for (const ov of overlays) {
    if (!ov.start || !ov.end) continue;
    const ovType = ov.extendedProps?.overlayType as PeriodGridException["type"] | undefined;
    for (const d of days) {
      const dayStart = new Date(d.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d.date);
      dayEnd.setHours(23, 59, 59, 999);
      if (!overlaps(ov.start, ov.end, dayStart, dayEnd)) continue;
      const ex: PeriodGridException = {
        exceptionId: String(ov.extendedProps?.exceptionId ?? ov.id ?? `${d.key}-${ov.title}`),
        type: ovType ?? "BREAK",
        title: String(ov.extendedProps?.overlayTitle ?? ov.title ?? "Exception"),
        startIso: String(ov.extendedProps?.overlayRangeStart ?? ""),
        endIso: String(ov.extendedProps?.overlayRangeEnd ?? ""),
      };
      dayExceptions[d.key].push(ex);
      for (const p of normalizedPeriods) {
        const cellKey = `${d.key}:${p.id}`;
        const c = cellsByKey[cellKey];
        if (!c) continue;
        c.exceptions.push(ex);
        c.state = "blocked";
      }
    }
  }

  const lessons = events.filter((e) => e.extendedProps?.kind === "lesson_session");
  const lessonPlacements: LessonPlacement[] = [];
  for (const ls of lessons) {
    if (!ls.start || !ls.end) continue;
    const dayKey = dateKey(ls.start);
    if (!dayExceptions[dayKey]) continue;
    const lessonStartMin = minutesOfDay(ls.start);
    const lessonEndMin = minutesOfDay(ls.end);
    const overlappedPeriodIndexes: number[] = [];
    for (let i = 0; i < normalizedPeriods.length; i++) {
      const p = normalizedPeriods[i]!;
      const psMin = minutesOfDay(p.startTime);
      const peMin = minutesOfDay(p.endTime);
      if (!minuteRangesOverlap(lessonStartMin, lessonEndMin, psMin, peMin)) continue;
      const c = cellsByKey[`${dayKey}:${p.id}`];
      if (!c) continue;
      if (c.exceptions.length > 0) continue;
      overlappedPeriodIndexes.push(i);
    }

    if (overlappedPeriodIndexes.length === 0) continue;
    const spanStartIndex = overlappedPeriodIndexes[0]!;
    const spanEndIndex = overlappedPeriodIndexes[overlappedPeriodIndexes.length - 1]!;
    const spanLength = spanEndIndex - spanStartIndex + 1;
    lessonPlacements.push({ lesson: ls, dayKey, spanStartIndex, spanLength });
  }

  // Row-span mode: only when one multi-period lesson does not overlap any other placement (same day).
  for (const pl of lessonPlacements) {
    if (!canUseRowSpanForPlacement(pl, lessonPlacements)) continue;
    const startPeriod = normalizedPeriods[pl.spanStartIndex]!;
    const startCell = cellsByKey[`${pl.dayKey}:${startPeriod.id}`];
    if (!startCell || startCell.exceptions.length > 0) continue;

    startCell.lessons = [pl.lesson];
    startCell.lessonIsSpanStart = true;
    startCell.lessonSpanLength = pl.spanLength;
    startCell.lessonIsContinuation = false;
    startCell.chips = mergeLessonChips(startCell.lessons);
    if (startCell.state === "empty") startCell.state = "occupied";

    for (let i = pl.spanStartIndex + 1; i < pl.spanStartIndex + pl.spanLength; i++) {
      const period = normalizedPeriods[i]!;
      const cell = cellsByKey[`${pl.dayKey}:${period.id}`];
      if (!cell || cell.exceptions.length > 0) continue;
      cell.lessonIsContinuation = true;
      cell.lessonSpanParentCellId = startCell.cellId;
      cell.lessons = [];
      if (cell.state === "empty") cell.state = "occupied";
    }
  }

  // Stacked mode: overlapping placements (same period or overlapping ranges) — show every lesson in each period cell.
  for (const pl of lessonPlacements) {
    if (canUseRowSpanForPlacement(pl, lessonPlacements)) continue;
    for (let i = pl.spanStartIndex; i < pl.spanStartIndex + pl.spanLength; i++) {
      const period = normalizedPeriods[i]!;
      const cell = cellsByKey[`${pl.dayKey}:${period.id}`];
      if (!cell || cell.exceptions.length > 0) continue;
      if (cell.lessonIsContinuation) continue;

      const existingIds = new Set(cell.lessons.map((l) => String(l.id ?? "")));
      if (!existingIds.has(String(pl.lesson.id ?? ""))) {
        cell.lessons.push(pl.lesson);
      }
      cell.lessons = sortLessonsForCell(dedupeLessonsById(cell.lessons));
      cell.chips = mergeLessonChips(cell.lessons);
      cell.lessonIsSpanStart = true;
      cell.lessonSpanLength = 1;
      cell.lessonIsContinuation = false;
      if (cell.state === "empty") cell.state = "occupied";
    }
  }

  const exams = events.filter((e) => e.extendedProps?.kind === "exam");
  for (const ex of exams) {
    if (!ex.start || !ex.end) continue;
    const dayKey = dateKey(ex.start);
    if (!dayExceptions[dayKey]) continue;
    const examStartMin = minutesOfDay(ex.start);
    const examEndMin = minutesOfDay(ex.end);
    for (const p of normalizedPeriods) {
      const psMin = minutesOfDay(p.startTime);
      const peMin = minutesOfDay(p.endTime);
      if (!minuteRangesOverlap(examStartMin, examEndMin, psMin, peMin)) continue;
      const c = cellsByKey[`${dayKey}:${p.id}`];
      if (!c) continue;
      if (c.exceptions.length > 0) continue;
      c.exams.push(ex);
      if (c.state === "empty") c.state = "occupied";
    }
  }

  return { days, periods: normalizedPeriods, cellsByKey, dayExceptions };
}
