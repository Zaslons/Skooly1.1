"use client";

import type { PeriodGridCell } from "@/lib/domain/periodGridAdapter";
import LessonBlockCard from "./LessonBlockCard";
import ExamInlineCard from "./ExamInlineCard";
import CellMetaChips from "./CellMetaChips";
import type { ScheduleEvent } from "@/components/BigCalender";
import type { CSSProperties } from "react";

export default function PeriodCell({
  cell,
  rowSpan = 1,
  selected = false,
  className,
  style,
  onLessonClick,
  onExamClick,
  onEmptyClick,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
}: {
  cell: PeriodGridCell;
  rowSpan?: number;
  selected?: boolean;
  className?: string;
  style?: CSSProperties;
  onLessonClick?: (lesson: ScheduleEvent) => void;
  onExamClick?: (exam: ScheduleEvent) => void;
  onEmptyClick?: () => void;
  onPointerDown?: () => void;
  onPointerEnter?: () => void;
  onPointerUp?: () => void;
}) {
  const blocked = cell.exceptions.length > 0;
  const hasLessons = cell.lessons.length > 0;
  const lessonCountLabel =
    cell.lessons.length > 1 ? `, ${cell.lessons.length} lessons` : hasLessons ? ", 1 lesson" : "";
  return (
    <div
      role="gridcell"
      tabIndex={0}
      aria-label={`Period cell ${cell.dayKey} ${cell.periodId}${rowSpan > 1 ? `, lesson spans ${rowSpan} periods` : ""}${lessonCountLabel}`}
      className={`relative z-10 min-h-24 h-full p-1.5 border-r ${selected ? "bg-indigo-100" : blocked ? "bg-amber-50" : "bg-white"} ${className ?? ""}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerUp={onPointerUp}
      onClick={() => {
        if (!hasLessons && cell.exams.length === 0) onEmptyClick?.();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !hasLessons && cell.exams.length === 0) {
          e.preventDefault();
          onEmptyClick?.();
        }
      }}
    >
      <div className="h-full flex flex-col gap-1 min-h-0">
        {cell.lessons.map((lesson) => (
          <LessonBlockCard
            key={String(lesson.id ?? lesson.title)}
            lesson={lesson}
            rowSpan={rowSpan}
            compact={cell.lessons.length > 1}
            onClick={() => onLessonClick?.(lesson)}
          />
        ))}
        {cell.exams.map((exam) => (
          <ExamInlineCard key={exam.id ?? String(Math.random())} exam={exam} onClick={() => onExamClick?.(exam)} />
        ))}
        <CellMetaChips chips={cell.chips} />
      </div>
    </div>
  );
}
