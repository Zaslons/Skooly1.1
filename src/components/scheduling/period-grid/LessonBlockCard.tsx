"use client";

import type { ScheduleEvent } from "@/components/BigCalender";

export default function LessonBlockCard({
  lesson,
  rowSpan = 1,
  compact = false,
  onClick,
}: {
  lesson: ScheduleEvent;
  rowSpan?: number;
  compact?: boolean;
  onClick?: () => void;
}) {
  const classLabel = String(lesson.extendedProps?.className ?? "").trim();
  const isOnline = lesson.extendedProps?.deliveryMode === "ONLINE";
  const meetingUrl = lesson.extendedProps?.meetingUrl;
  const meetingLabel =
    typeof lesson.extendedProps?.meetingLabel === "string" && lesson.extendedProps.meetingLabel.trim()
      ? lesson.extendedProps.meetingLabel.trim()
      : "Join";
  const joinHref = typeof meetingUrl === "string" && meetingUrl.trim() ? meetingUrl.trim() : null;
  return (
    <div
      className={`w-full shrink-0 rounded text-white flex flex-col overflow-hidden ${
        isOnline ? "bg-indigo-600" : "bg-blue-600"
      } ${compact ? "" : "flex-1 h-full"}`}
    >
      <button
        type="button"
        className={`w-full text-left flex flex-col flex-1 min-h-0 ${
          isOnline ? "hover:bg-indigo-700" : "hover:bg-blue-700"
        } ${compact ? "p-1.5" : "p-2"}`}
        onClick={onClick}
      >
        {isOnline && (
          <div className={`font-semibold truncate opacity-95 ${compact ? "text-[9px]" : "text-[10px]"}`}>
            Online
          </div>
        )}
        {classLabel ? (
          <div className={`font-semibold truncate ${compact ? "text-[10px]" : "text-xs"}`}>{classLabel}</div>
        ) : null}
        <div
          className={`truncate ${classLabel ? "opacity-95" : "font-semibold"} ${compact ? "text-[10px]" : "text-xs"}`}
        >
          {lesson.title ?? "Lesson"}
        </div>
        <div className={`opacity-90 truncate ${compact ? "text-[9px]" : "text-[11px]"}`}>
          {String(lesson.extendedProps?.effectiveTeacherName ?? lesson.extendedProps?.teacherName ?? "")}
        </div>
        {!compact && rowSpan > 1 && (
          <div className="mt-auto pt-2 text-[10px] opacity-90">
            {rowSpan} blocks
          </div>
        )}
      </button>
      {isOnline && joinHref && !compact && (
        <a
          href={joinHref}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-2 py-1.5 text-center text-[11px] font-medium bg-indigo-800/90 hover:bg-indigo-900 border-t border-indigo-500/40"
          onClick={(e) => e.stopPropagation()}
        >
          {meetingLabel}
        </a>
      )}
    </div>
  );
}
