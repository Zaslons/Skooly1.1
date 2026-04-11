"use client";

import type { ScheduleEvent } from "@/components/BigCalender";

export default function ExamInlineCard({
  exam,
  onClick,
}: {
  exam: ScheduleEvent;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full text-left p-1.5 rounded bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200"
      onClick={onClick}
    >
      <div className="text-[11px] font-medium truncate">{exam.title ?? "Exam"}</div>
    </button>
  );
}
