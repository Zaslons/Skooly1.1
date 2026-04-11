"use client";

export type PeriodGridFilters = {
  showLessons: boolean;
  showExams: boolean;
  showExceptions: boolean;
};

export default function PeriodGridFiltersBar({
  value,
  onChange,
}: {
  value: PeriodGridFilters;
  onChange: (next: PeriodGridFilters) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.showLessons}
          onChange={(e) => onChange({ ...value, showLessons: e.target.checked })}
        />
        Lessons
      </label>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.showExams}
          onChange={(e) => onChange({ ...value, showExams: e.target.checked })}
        />
        Exams
      </label>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.showExceptions}
          onChange={(e) => onChange({ ...value, showExceptions: e.target.checked })}
        />
        Exceptions
      </label>
    </div>
  );
}
