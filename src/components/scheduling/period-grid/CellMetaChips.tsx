"use client";

export default function CellMetaChips({
  chips,
}: {
  chips: Array<{ kind: "POP_QUIZ" | "ASSIGNMENT_DUE"; label: string; count: number }>;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, idx) => (
        <span
          key={`${c.kind}-${idx}`}
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            c.kind === "POP_QUIZ" ? "bg-violet-100 text-violet-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {c.label}
          {c.count > 1 ? ` (${c.count})` : ""}
        </span>
      ))}
    </div>
  );
}
