"use client";

import type { PeriodGridPeriod } from "@/lib/domain/periodGridAdapter";

export default function PeriodRowLabel({ period }: { period: PeriodGridPeriod }) {
  return (
    <div className="h-full p-2 border-r bg-white">
      <div className="text-sm font-medium text-gray-800">{period.name}</div>
      <div className="text-xs text-gray-500">
        {period.startTimeLabel} - {period.endTimeLabel}
      </div>
    </div>
  );
}
