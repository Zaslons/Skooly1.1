"use client";

import type { PeriodGridDay, PeriodGridException } from "@/lib/domain/periodGridAdapter";

export default function PeriodGridDayHeader({
  day,
  exceptions,
}: {
  day: PeriodGridDay;
  exceptions: PeriodGridException[];
}) {
  return (
    <div className="p-2 border-b bg-gray-50">
      <div className="text-xs text-gray-500">{day.labelShort}</div>
      {exceptions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {exceptions.map((ex) => (
            <span key={ex.exceptionId} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
              {ex.type.replace("_", " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
