"use client";

import { useState, useEffect } from "react";
import { toast } from "react-toastify";

type Props = {
  isOpen: boolean;
  onClose: (refresh?: boolean) => void;
  schoolId: string;
  extendedProps: Record<string, unknown> | null;
  rooms: { id: number; name: string }[];
  teachers: { id: string; name: string; surname: string }[];
};

export default function LessonSessionInstanceModal({
  isOpen,
  onClose,
  schoolId,
  extendedProps,
  rooms,
  teachers,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"SCHEDULED" | "CANCELLED">("SCHEDULED");
  const [substituteTeacherId, setSubstituteTeacherId] = useState<string>("");
  const [overrideRoomId, setOverrideRoomId] = useState<string>("");
  const [instanceNotes, setInstanceNotes] = useState("");
  const [lastOverrideReason, setLastOverrideReason] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [meetingLabel, setMeetingLabel] = useState("");

  const lessonSessionId = extendedProps?.lessonSessionId as number | undefined;
  const isOnline = extendedProps?.deliveryMode === "ONLINE";

  useEffect(() => {
    if (!isOpen || !extendedProps) return;
    setStatus((extendedProps.status as "SCHEDULED" | "CANCELLED") ?? "SCHEDULED");
    setSubstituteTeacherId((extendedProps.substituteTeacherId as string) ?? "");
    setOverrideRoomId(
      extendedProps.overrideRoomId != null ? String(extendedProps.overrideRoomId) : ""
    );
    setInstanceNotes((extendedProps.instanceNotes as string) ?? "");
    setLastOverrideReason("");
    setMeetingUrl(
      typeof extendedProps.meetingUrl === "string" ? extendedProps.meetingUrl : ""
    );
    setMeetingLabel(
      typeof extendedProps.meetingLabel === "string" ? extendedProps.meetingLabel : ""
    );
  }, [isOpen, extendedProps]);

  if (!isOpen || !extendedProps || lessonSessionId == null) return null;

  const title = `${extendedProps.subjectName ?? "Lesson"} (${extendedProps.className ?? "Class"})`;

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/lesson-sessions/${lessonSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          substituteTeacherId: substituteTeacherId || null,
          overrideRoomId: overrideRoomId ? Number.parseInt(overrideRoomId, 10) : null,
          instanceNotes: instanceNotes || null,
          lastOverrideReason: lastOverrideReason || null,
          ...(isOnline
            ? {
                meetingUrl: meetingUrl.trim() || null,
                meetingLabel: meetingLabel.trim() || null,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to update session.");
        return;
      }
      toast.success("Session updated (template unchanged).");
      onClose(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900">Edit lesson instance</h2>
        <p className="text-sm text-gray-600 mt-1">
          {title} — changes apply only to this date, not the weekly template.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as "SCHEDULED" | "CANCELLED")}
            >
              <option value="SCHEDULED">Scheduled</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Substitute teacher</label>
            <select
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={substituteTeacherId}
              onChange={(e) => setSubstituteTeacherId(e.target.value)}
            >
              <option value="">— None (use regular teacher) —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.surname}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Regular: {String(extendedProps.teacherName ?? "")}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Room override</label>
            <select
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={overrideRoomId}
              onChange={(e) => setOverrideRoomId(e.target.value)}
            >
              <option value="">— None (use default room) —</option>
              {rooms.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {isOnline && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Meeting link (this date only)</label>
                <input
                  type="url"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Link label</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={meetingLabel}
                  onChange={(e) => setMeetingLabel(e.target.value)}
                  placeholder="e.g. Zoom"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              value={instanceNotes}
              onChange={(e) => setInstanceNotes(e.target.value)}
              placeholder="Visible to admins"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Reason for change</label>
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={lastOverrideReason}
              onChange={(e) => setLastOverrideReason(e.target.value)}
              placeholder="Audit trail"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-md border border-gray-300 text-sm"
            onClick={() => onClose(false)}
            disabled={saving}
          >
            Close
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm disabled:opacity-50"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
