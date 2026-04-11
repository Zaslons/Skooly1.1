"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScheduleEvent } from "@/components/BigCalender";
import { buildPeriodGridModel } from "@/lib/domain/periodGridAdapter";
import PeriodGridHeader from "./PeriodGridHeader";
import PeriodGridDayHeader from "./PeriodGridDayHeader";
import PeriodRowLabel from "./PeriodRowLabel";
import PeriodCell from "./PeriodCell";

function startOfWeek(d: Date) {
  const x = new Date(d);
  const dow = x.getDay();
  const diff = (dow + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function PeriodGridCalendar({
  events,
  periods,
  loading,
  onRangeChange,
  onLessonClick,
  onExamClick,
  onEmptyCellClick,
  onEmptyRangeSelect,
}: {
  events: ScheduleEvent[];
  periods: Array<{ id: string; order: number; name: string; startTime: string | Date; endTime: string | Date }>;
  loading?: boolean;
  onRangeChange: (start: Date, end: Date) => void;
  onLessonClick?: (lesson: ScheduleEvent) => void;
  onExamClick?: (exam: ScheduleEvent) => void;
  onEmptyCellClick?: (args: { day: Date; periodId: string }) => void;
  onEmptyRangeSelect?: (args: { day: Date; startPeriodId: string; endPeriodId: string }) => void;
}) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [isDragging, setIsDragging] = useState(false);
  const [dragAnchor, setDragAnchor] = useState<{ dayKey: string; periodId: string } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ dayKey: string; periodId: string } | null>(null);
  const onRangeChangeRef = useRef(onRangeChange);

  useEffect(() => {
    onRangeChangeRef.current = onRangeChange;
  }, [onRangeChange]);

  useEffect(() => {
    const s = new Date(weekStart);
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 7);
    onRangeChangeRef.current(s, e);
  }, [weekStart]);

  const rangeLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${weekStart.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }, [weekStart]);

  const model = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 7);
    return buildPeriodGridModel({ events, periods, rangeStart: weekStart, rangeEnd: e });
  }, [events, periods, weekStart]);

  const selectedCellIds = useMemo(() => {
    if (!dragAnchor || !dragCurrent || dragAnchor.dayKey !== dragCurrent.dayKey) return new Set<string>();
    const dayKey = dragAnchor.dayKey;
    const a = model.periods.findIndex((p) => p.id === dragAnchor.periodId);
    const b = model.periods.findIndex((p) => p.id === dragCurrent.periodId);
    if (a < 0 || b < 0) return new Set<string>();
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const set = new Set<string>();
    for (let i = start; i <= end; i++) {
      const p = model.periods[i]!;
      set.add(`${dayKey}:${p.id}`);
    }
    return set;
  }, [dragAnchor, dragCurrent, model.periods]);

  const isSelectableCell = useCallback(
    (cellId: string) => {
      const c = model.cellsByKey[cellId];
      if (!c) return false;
      if (c.exceptions.length > 0) return false;
      if (c.lessons.length > 0 || c.exams.length > 0) return false;
      return true;
    },
    [model.cellsByKey]
  );

  const handleCellPointerDown = useCallback(
    (dayKey: string, periodId: string) => {
      const cellId = `${dayKey}:${periodId}`;
      if (!isSelectableCell(cellId)) return;
      setIsDragging(true);
      const point = { dayKey, periodId };
      setDragAnchor(point);
      setDragCurrent(point);
    },
    [isSelectableCell]
  );

  const handleCellPointerEnter = useCallback((dayKey: string, periodId: string) => {
    if (!isDragging || !dragAnchor) return;
    if (dayKey !== dragAnchor.dayKey) return;
    setDragCurrent({ dayKey, periodId });
  }, [isDragging, dragAnchor]);

  const finalizeDragSelection = useCallback(() => {
    if (!isDragging || !dragAnchor || !dragCurrent || dragAnchor.dayKey !== dragCurrent.dayKey) {
      setIsDragging(false);
      setDragAnchor(null);
      setDragCurrent(null);
      return;
    }
    const day = model.days.find((d) => d.key === dragAnchor.dayKey)?.date;
    if (!day) {
      setIsDragging(false);
      setDragAnchor(null);
      setDragCurrent(null);
      return;
    }
    const a = model.periods.findIndex((p) => p.id === dragAnchor.periodId);
    const b = model.periods.findIndex((p) => p.id === dragCurrent.periodId);
    if (a < 0 || b < 0) {
      setIsDragging(false);
      setDragAnchor(null);
      setDragCurrent(null);
      return;
    }
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const startPeriodId = model.periods[start]!.id;
    const endPeriodId = model.periods[end]!.id;
    if (onEmptyRangeSelect) {
      onEmptyRangeSelect({ day, startPeriodId, endPeriodId });
    } else {
      onEmptyCellClick?.({ day, periodId: startPeriodId });
    }
    setIsDragging(false);
    setDragAnchor(null);
    setDragCurrent(null);
  }, [isDragging, dragAnchor, dragCurrent, model.days, model.periods, onEmptyRangeSelect, onEmptyCellClick]);

  useEffect(() => {
    if (!isDragging) return;
    const onWindowPointerUp = () => finalizeDragSelection();
    window.addEventListener("pointerup", onWindowPointerUp);
    return () => window.removeEventListener("pointerup", onWindowPointerUp);
  }, [isDragging, finalizeDragSelection]);

  return (
    <div className="space-y-3">
      <PeriodGridHeader
        rangeLabel={rangeLabel}
        onPrev={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() - 7))}
        onToday={() => setWeekStart(startOfWeek(new Date()))}
        onNext={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7))}
      />
      {loading && <div className="text-sm text-gray-500">Loading…</div>}
      <div className="overflow-auto border rounded-md">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `180px repeat(${model.days.length}, minmax(170px, 1fr))`,
            gridTemplateRows: `48px repeat(${model.periods.length}, minmax(96px, auto))`,
          }}
        >
          <div className="border-b bg-gray-50" style={{ gridColumn: 1, gridRow: 1 }} />
          {model.days.map((d, dayIndex) => (
            <div key={d.key} style={{ gridColumn: dayIndex + 2, gridRow: 1 }}>
              <PeriodGridDayHeader day={d} exceptions={model.dayExceptions[d.key] ?? []} />
            </div>
          ))}

          {model.periods.map((p, periodIndex) => (
            <div key={p.id} style={{ gridColumn: 1, gridRow: periodIndex + 2 }}>
              <PeriodRowLabel period={p} />
            </div>
          ))}

          {model.days.map((d, dayIndex) => (
            <div
              key={`col-sep-${d.key}`}
              className="pointer-events-none border-r"
              style={{ gridColumn: dayIndex + 2, gridRow: `2 / span ${model.periods.length}` }}
            />
          ))}

          {model.days.map((d, dayIndex) =>
            model.periods.map((p, periodIndex) => {
              const cell = model.cellsByKey[`${d.key}:${p.id}`];
              if (cell.lessonIsContinuation) return null;
              const rowSpan =
                cell.lessonIsSpanStart && cell.lessonSpanLength > 1 && cell.lessons.length === 1
                  ? cell.lessonSpanLength
                  : 1;
              return (
                <PeriodCell
                  key={cell.cellId}
                  cell={cell}
                  selected={selectedCellIds.has(cell.cellId)}
                  rowSpan={rowSpan}
                  className={periodIndex === model.periods.length - 1 ? "" : "border-b"}
                  style={{
                    gridColumn: dayIndex + 2,
                    gridRow: `${periodIndex + 2} / span ${rowSpan}`,
                  }}
                  onPointerDown={() => handleCellPointerDown(d.key, p.id)}
                  onPointerEnter={() => handleCellPointerEnter(d.key, p.id)}
                  onPointerUp={finalizeDragSelection}
                  onLessonClick={onLessonClick}
                  onExamClick={onExamClick}
                  onEmptyClick={() => onEmptyCellClick?.({ day: d.date, periodId: p.id })}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
