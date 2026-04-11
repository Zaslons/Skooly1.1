"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";

type PeriodRow = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  order: number;
  isArchived: boolean;
};

function formatTimeLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Build a Date for today with hours/minutes from `HH:mm` (local). */
function timeStrToTodayDate(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function dateToTimeInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "09:00";
  const h = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${min}`;
}

const BellScheduleClient = ({ schoolId }: { schoolId: string }) => {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createStart, setCreateStart] = useState("09:00");
  const [createEnd, setCreateEnd] = useState("10:00");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("09:00");
  const [editEnd, setEditEnd] = useState("10:00");
  const [editOrder, setEditOrder] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = showArchived ? "?includeArchived=true" : "";
      const res = await fetch(`/api/schools/${schoolId}/periods${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load periods.");
      }
      const raw = (data.periods ?? []) as Array<{
        id: string;
        name: string;
        startTime: string;
        endTime: string;
        order: number;
        isArchived: boolean;
      }>;
      setPeriods(
        raw.map((p) => ({
          ...p,
          startTime: new Date(p.startTime).toISOString(),
          endTime: new Date(p.endTime).toISOString(),
        }))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load periods.");
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (p: PeriodRow) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditStart(dateToTimeInputValue(p.startTime));
    setEditEnd(dateToTimeInputValue(p.endTime));
    setEditOrder(p.order);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/periods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          startTime: timeStrToTodayDate(createStart).toISOString(),
          endTime: timeStrToTodayDate(createEnd).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Create failed.");
      }
      toast.success("Bell period created.");
      setCreateName("");
      setCreateStart("09:00");
      setCreateEnd("10:00");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/periods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          startTime: timeStrToTodayDate(editStart).toISOString(),
          endTime: timeStrToTodayDate(editEnd).toISOString(),
          order: editOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Update failed.");
      }
      toast.success("Period updated.");
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (id: string, isArchived: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/periods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Update failed.");
      }
      toast.success(isArchived ? "Period archived." : "Period restored.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = periods.filter((p) => !p.isArchived).length;

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bell schedule</h1>
          <p className="text-sm text-gray-600 mt-1">
            Define named time blocks (e.g. Period 1, Lunch). Lessons can still use free-form times within{" "}
            <strong>8:00–17:00</strong> until you link them to a period in a later update.
          </p>
        </div>
        <Link href={`/schools/${schoolId}/admin/setup`} className="text-sm underline text-gray-800">
          Back to scheduling setup
        </Link>
      </div>

      <div className="p-4 rounded-md border border-blue-100 bg-blue-50 text-sm text-blue-900">
        <p className="font-medium">Default school hours</p>
        <p className="mt-1">
          Active periods must fall within <strong>8:00–17:00</strong> (local time) and must not overlap. Archiving removes a
          block from the active grid without deleting history.
        </p>
      </div>

      {activeCount === 0 && !showArchived && !loading && (
        <div className="p-4 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          <p className="font-medium">No bell periods yet</p>
          <p className="mt-1">
            Add your first period below. Until then, weekly lessons can still be created with custom start/end times within
            the default working hours on the schedule page.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Add period</h2>
        <form onSubmit={submitCreate} className="flex flex-wrap items-end gap-3 p-4 border rounded-md bg-white">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              className="border rounded px-2 py-1.5 text-sm min-w-[140px]"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Period 1"
              disabled={saving}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start</label>
            <input
              type="time"
              className="border rounded px-2 py-1.5 text-sm"
              value={createStart}
              onChange={(e) => setCreateStart(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End</label>
            <input
              type="time"
              className="border rounded px-2 py-1.5 text-sm"
              value={createEnd}
              onChange={(e) => setCreateEnd(e.target.value)}
              disabled={saving}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-2 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </section>

      <div className="flex items-center gap-2 text-sm">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-2 px-2 py-1 rounded border text-xs hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">Periods</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : periods.length === 0 ? (
          <p className="text-sm text-gray-500">No periods to show.</p>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">Order</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Start</th>
                  <th className="text-left p-2">End</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className="border-t">
                    {editingId === p.id ? (
                      <>
                        <td className="p-2">
                          <input
                            type="number"
                            className="border rounded w-16 px-1 py-0.5"
                            value={editOrder}
                            onChange={(e) => setEditOrder(Number.parseInt(e.target.value, 10) || 0)}
                            disabled={saving}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="border rounded px-1 py-0.5 w-full max-w-[140px]"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            disabled={saving}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="time"
                            className="border rounded"
                            value={editStart}
                            onChange={(e) => setEditStart(e.target.value)}
                            disabled={saving}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="time"
                            className="border rounded"
                            value={editEnd}
                            onChange={(e) => setEditEnd(e.target.value)}
                            disabled={saving}
                          />
                        </td>
                        <td className="p-2">{p.isArchived ? "Archived" : "Active"}</td>
                        <td className="p-2 space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            className="text-blue-700 underline text-xs"
                            disabled={saving}
                            onClick={() => void submitEdit(p.id)}
                          >
                            Save
                          </button>
                          <button type="button" className="text-gray-600 underline text-xs" disabled={saving} onClick={cancelEdit}>
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2">{p.order}</td>
                        <td className="p-2 font-medium">{p.name}</td>
                        <td className="p-2">{formatTimeLabel(p.startTime)}</td>
                        <td className="p-2">{formatTimeLabel(p.endTime)}</td>
                        <td className="p-2">
                          {p.isArchived ? (
                            <span className="text-amber-700">Archived</span>
                          ) : (
                            <span className="text-green-700">Active</span>
                          )}
                        </td>
                        <td className="p-2 space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            className="text-blue-700 underline text-xs"
                            disabled={saving}
                            onClick={() => startEdit(p)}
                          >
                            Edit
                          </button>
                          {!p.isArchived ? (
                            <button
                              type="button"
                              className="text-amber-800 underline text-xs"
                              disabled={saving}
                              onClick={() => {
                                if (confirm(`Archive “${p.name}”?`)) void setArchived(p.id, true);
                              }}
                            >
                              Archive
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-green-800 underline text-xs"
                              disabled={saving}
                              onClick={() => void setArchived(p.id, false)}
                            >
                              Restore
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default BellScheduleClient;
