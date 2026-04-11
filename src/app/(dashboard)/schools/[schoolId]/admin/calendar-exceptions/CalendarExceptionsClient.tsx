"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarExceptionType } from "@prisma/client";
import { toast } from "react-toastify";

type TermRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
};

type ExceptionRow = {
  id: string;
  schoolId: string;
  termId: string;
  title: string;
  type: CalendarExceptionType;
  startDate: string;
  endDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  schoolId: string;
  terms: TermRow[];
  initialTermId: string | null;
};

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function typeLabel(t: CalendarExceptionType) {
  if (t === CalendarExceptionType.EXAM_PERIOD) return "Exam period";
  if (t === CalendarExceptionType.BREAK) return "Break";
  return "Holiday";
}

export default function CalendarExceptionsClient({ schoolId, terms, initialTermId }: Props) {
  const [selectedTermId, setSelectedTermId] = useState<string>(initialTermId ?? "");
  const [typeFilter, setTypeFilter] = useState<"" | CalendarExceptionType>("");
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ExceptionRow | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<CalendarExceptionType>(CalendarExceptionType.HOLIDAY);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const selectedTerm = useMemo(
    () => terms.find((t) => t.id === selectedTermId) ?? null,
    [terms, selectedTermId]
  );

  const resetForm = useCallback(() => {
    setEditing(null);
    setTitle("");
    setType(CalendarExceptionType.HOLIDAY);
    setStartDate("");
    setEndDate("");
    setNotes("");
  }, []);

  const load = useCallback(async () => {
    if (!selectedTermId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (typeFilter) q.set("type", typeFilter);
      const res = await fetch(
        `/api/schools/${schoolId}/terms/${selectedTermId}/calendar-exceptions?${q.toString()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to load calendar exceptions.");
      }
      setRows((json.exceptions ?? []) as ExceptionRow[]);
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : "Failed to load exceptions.");
    } finally {
      setLoading(false);
    }
  }, [schoolId, selectedTermId, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTermId) {
      toast.error("Please select a term.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        type,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        notes: notes.trim() ? notes.trim() : null,
      };
      const url = editing
        ? `/api/schools/${schoolId}/terms/${selectedTermId}/calendar-exceptions/${editing.id}`
        : `/api/schools/${schoolId}/terms/${selectedTermId}/calendar-exceptions`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to save exception.");
      }
      toast.success(editing ? "Exception updated." : "Exception created.");
      resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save exception.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: ExceptionRow) => {
    setEditing(row);
    setTitle(row.title);
    setType(row.type);
    setStartDate(toDatetimeLocalValue(row.startDate));
    setEndDate(toDatetimeLocalValue(row.endDate));
    setNotes(row.notes ?? "");
  };

  const remove = async (row: ExceptionRow) => {
    if (!selectedTermId) return;
    const ok = window.confirm(`Delete "${row.title}"?`);
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/schools/${schoolId}/terms/${selectedTermId}/calendar-exceptions/${row.id}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to delete exception.");
      }
      toast.success("Exception deleted.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete exception.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar exceptions</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage holidays, breaks, and exam periods within a term.
          </p>
        </div>
        <Link href={`/schools/${schoolId}/admin/setup`} className="text-sm underline">
          Back to setup
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500">Term</label>
          <select
            className="mt-1 w-full ring-1 ring-gray-300 rounded-md p-2 text-sm"
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
          >
            <option value="">Select term</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.isArchived ? " (Archived)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Filter type</label>
          <select
            className="mt-1 w-full ring-1 ring-gray-300 rounded-md p-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter((e.target.value as CalendarExceptionType) || "")}
          >
            <option value="">All types</option>
            <option value={CalendarExceptionType.HOLIDAY}>Holiday</option>
            <option value={CalendarExceptionType.BREAK}>Break</option>
            <option value={CalendarExceptionType.EXAM_PERIOD}>Exam period</option>
          </select>
        </div>
      </div>

      <form onSubmit={submit} className="border rounded-md p-4 bg-white space-y-3">
        <h2 className="font-semibold">{editing ? "Edit exception" : "Create exception"}</h2>
        {selectedTerm?.isArchived && (
          <p className="text-sm text-amber-700">Selected term is archived and cannot be edited.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Type</label>
            <select
              className="mt-1 w-full ring-1 ring-gray-300 rounded-md p-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as CalendarExceptionType)}
            >
              <option value={CalendarExceptionType.HOLIDAY}>Holiday</option>
              <option value={CalendarExceptionType.BREAK}>Break</option>
              <option value={CalendarExceptionType.EXAM_PERIOD}>Exam period</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Title</label>
            <input
              className="mt-1 w-full ring-1 ring-gray-300 rounded-md p-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Midterm week"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Start</label>
            <input
              type="datetime-local"
              className="mt-1 w-full ring-1 ring-gray-300 rounded-md p-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">End</label>
            <input
              type="datetime-local"
              className="mt-1 w-full ring-1 ring-gray-300 rounded-md p-2 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500">Notes (optional)</label>
            <textarea
              className="mt-1 w-full ring-1 ring-gray-300 rounded-md p-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={saving || !selectedTermId || !!selectedTerm?.isArchived}
            className="px-4 py-2 text-sm rounded bg-indigo-600 text-white disabled:bg-gray-400"
            type="submit"
          >
            {editing ? "Save changes" : "Create exception"}
          </button>
          {editing && (
            <button
              type="button"
              className="px-4 py-2 text-sm rounded border"
              onClick={resetForm}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <section className="space-y-2">
        <h2 className="font-semibold">Exceptions</h2>
        <div className="overflow-x-auto border rounded-md bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Title</th>
                <th className="text-left p-2">Start</th>
                <th className="text-left p-2">End</th>
                <th className="text-left p-2">Notes</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={6}>Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={6}>No exceptions found.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{typeLabel(r.type)}</td>
                    <td className="p-2">{r.title}</td>
                    <td className="p-2">{new Date(r.startDate).toLocaleString()}</td>
                    <td className="p-2">{new Date(r.endDate).toLocaleString()}</td>
                    <td className="p-2 max-w-xs truncate" title={r.notes ?? ""}>{r.notes ?? "—"}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <button className="text-blue-700 underline" onClick={() => startEdit(r)}>Edit</button>
                        <button className="text-red-700 underline" onClick={() => void remove(r)} disabled={saving}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
