"use client";

export default function PeriodGridHeader({
  rangeLabel,
  onPrev,
  onToday,
  onNext,
}: {
  rangeLabel: string;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm font-semibold text-gray-700">{rangeLabel}</div>
      <div className="flex items-center gap-2">
        <button type="button" className="px-2 py-1 text-sm rounded border" onClick={onPrev}>
          Prev
        </button>
        <button type="button" className="px-2 py-1 text-sm rounded border" onClick={onToday}>
          Today
        </button>
        <button type="button" className="px-2 py-1 text-sm rounded border" onClick={onNext}>
          Next
        </button>
      </div>
    </div>
  );
}
