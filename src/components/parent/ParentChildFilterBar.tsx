"use client";

import { cn } from "@/lib/utils";

export type ParentChildFilterOption = {
  id: string;
  label: string;
  /** Shown under or beside the name when children attend multiple schools. */
  sublabel?: string;
};

const chipClass = (active: boolean) =>
  cn(
    "rounded-full border px-3 py-1.5 text-sm transition-colors text-left min-w-0",
    active
      ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-500/30"
      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
  );

type Props = {
  options: ParentChildFilterOption[];
  selected: "all" | string;
  onSelect: (id: "all" | string) => void;
  allLabel?: string;
  className?: string;
};

/**
 * Horizontal chips: "All" + one per child. Omits itself when there is nothing to switch (0–1 children).
 */
export default function ParentChildFilterBar({
  options,
  selected,
  onSelect,
  allLabel = "All children",
  className,
}: Props) {
  if (options.length <= 1) {
    return null;
  }

  return (
    <div
      className={cn("flex flex-wrap gap-2 items-start", className)}
      role="group"
      aria-label="Filter by child"
    >
      <button
        type="button"
        aria-pressed={selected === "all"}
        onClick={() => onSelect("all")}
        className={chipClass(selected === "all")}
      >
        {allLabel}
      </button>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={selected === opt.id}
          onClick={() => onSelect(opt.id)}
          className={cn(chipClass(selected === opt.id), "flex flex-col gap-0")}
        >
          <span>{opt.label}</span>
          {opt.sublabel ? (
            <span className="text-xs font-normal text-gray-500">{opt.sublabel}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
