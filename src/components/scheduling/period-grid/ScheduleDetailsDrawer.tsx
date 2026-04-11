"use client";

export default function ScheduleDetailsDrawer({
  open,
  title,
  details,
  onClose,
}: {
  open: boolean;
  title: string;
  details: string[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l shadow-xl z-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{title}</h3>
        <button type="button" className="text-sm underline" onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="space-y-2 text-sm text-gray-700">
        {details.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </div>
  );
}
