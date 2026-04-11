"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import type { Day } from "@prisma/client";
import { Day as PrismaDay } from "@prisma/client";

type TermLite = { id: string; name: string; startDate: string | Date; endDate: string | Date };
type ClassLite = { id: number; name: string };
type SubjectLite = { id: number; name: string };
type TeacherLite = { id: string; name: string; surname: string };
type RoomLite = { id: number; name: string };

type LoopRow = {
  weekIndex: number;
  day: Day;
  startTime: string; // HH:MM
  durationMinutes: number;
  classId: number;
  subjectId: number;
  roomId: number | null;
  teacherId: string | null;
};

type PreviewOccurrence = {
  weekIndex: number;
  occurrenceIndex: number;
  day: Day;
  startTime: string | Date;
  endTime: string | Date;
  status: "create" | "skip" | "conflict";
  reason?: string;
};

type RecurringPreviewResponse = {
  requestId: string;
  termId: string;
  groupedByWeekIndex: Record<number, PreviewOccurrence[]>;
  summary: { wouldCreate: number; skipped: number; conflicted: number };
};

function formatDateTime(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(dt);
}

const DAY_OPTIONS: Day[] = [PrismaDay.MONDAY, PrismaDay.TUESDAY, PrismaDay.WEDNESDAY, PrismaDay.THURSDAY, PrismaDay.FRIDAY, PrismaDay.SATURDAY, PrismaDay.SUNDAY];

export default function RecurringExamBuilder(props: {
  schoolId: string;
  terms: TermLite[];
  initialTermId?: string | null;
  classes: ClassLite[];
  subjects: SubjectLite[];
  teachers: TeacherLite[];
  rooms: RoomLite[];
}) {
  const router = useRouter();

  const [termId, setTermId] = useState<string>(props.initialTermId ?? props.terms[0]?.id ?? "");
  const [strictMode, setStrictMode] = useState(true);
  const [preview, setPreview] = useState<RecurringPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedTerm = useMemo(() => {
    return props.terms.find((t) => t.id === termId) ?? props.terms[0];
  }, [props.terms, termId]);

  const weekCount = useMemo(() => {
    if (!selectedTerm) return 1;
    const start = typeof selectedTerm.startDate === "string" ? new Date(selectedTerm.startDate) : selectedTerm.startDate;
    const end = typeof selectedTerm.endDate === "string" ? new Date(selectedTerm.endDate) : selectedTerm.endDate;
    const ms = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
  }, [selectedTerm]);

  const defaultClassId = props.classes[0]?.id ?? 0;
  const defaultSubjectId = props.subjects[0]?.id ?? 0;

  const defaultRow = (weekIndex: number): LoopRow => ({
    weekIndex,
    day: PrismaDay.MONDAY,
    startTime: "09:00",
    durationMinutes: 60,
    classId: defaultClassId,
    subjectId: defaultSubjectId,
    roomId: null,
    teacherId: null,
  });

  const effectiveWeekCount = Math.max(1, Math.min(20, weekCount));

  const [loops, setLoops] = useState<LoopRow[]>(() => Array.from({ length: 1 }, (_, i) => defaultRow(i)));

  useEffect(() => {
    setLoops((prev) => {
      return Array.from({ length: effectiveWeekCount }, (_, i) => prev[i] ?? defaultRow(i));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveWeekCount, termId, defaultClassId, defaultSubjectId]);

  async function onPreview() {
    setLoading(true);
    try {
      const payload = {
        termId,
        strictMode,
        loops: loops.map((l) => ({
          weekIndex: l.weekIndex,
          day: l.day,
          startTime: l.startTime,
          durationMinutes: l.durationMinutes,
          classId: l.classId,
          subjectId: l.subjectId,
          roomId: l.roomId,
          teacherId: l.teacherId,
        })),
      };

      const res = await fetch(`/api/schools/${props.schoolId}/exams/recurring/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to preview recurring exams.");
        return;
      }
      setPreview(data as RecurringPreviewResponse);
      toast.success("Preview generated.");
    } catch {
      toast.error("Failed to preview recurring exams.");
    } finally {
      setLoading(false);
    }
  }

  async function onCommit() {
    setLoading(true);
    try {
      const payload = {
        termId,
        strictMode,
        loops: loops.map((l) => ({
          weekIndex: l.weekIndex,
          day: l.day,
          startTime: l.startTime,
          durationMinutes: l.durationMinutes,
          classId: l.classId,
          subjectId: l.subjectId,
          roomId: l.roomId,
          teacherId: l.teacherId,
        })),
      };

      const res = await fetch(`/api/schools/${props.schoolId}/exams/recurring/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to commit recurring exams.");
        return;
      }
      toast.success("Recurring exams committed.");
      router.refresh();
    } catch {
      toast.error("Failed to commit recurring exams.");
    } finally {
      setLoading(false);
    }
  }

  const weekKeys = useMemo(() => {
    if (!preview) return [];
    return Object.keys(preview.groupedByWeekIndex)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
  }, [preview]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">DS Recurring Exams Builder</h1>
          <p className="text-sm text-gray-600 mt-1">Preview occurrences first, then commit (strict/lenient).</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm">
            <input type="checkbox" checked={strictMode} onChange={(e) => setStrictMode(e.target.checked)} className="mr-2" />
            Strict mode
          </label>
        </div>
      </div>

      <div className="bg-white rounded-md border p-4 space-y-3">
        <div className="flex gap-3 items-center flex-wrap">
          <label className="text-sm font-medium">Term</label>
          <select className="border rounded-md p-2 text-sm" value={termId} onChange={(e) => { setTermId(e.target.value); setPreview(null); }}>
            {props.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">
            Weeks: {effectiveWeekCount} (capped for UI)
          </span>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button onClick={() => void onPreview()} disabled={loading || !termId} className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm disabled:opacity-50">
            Preview
          </button>
          <button onClick={() => void onCommit()} disabled={loading || !termId} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm disabled:opacity-50">
            Commit
          </button>
        </div>
      </div>

      <div className="bg-white rounded-md border p-4">
        <h2 className="font-semibold mb-3">Week-by-week loop rows</h2>
        <div className="space-y-4">
          {loops.map((row) => (
            <div key={row.weekIndex} className="p-3 rounded-md border bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Week {row.weekIndex + 1}</p>
                <span className="text-xs text-gray-500">{row.day}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                <div className="flex flex-col">
                  <label className="text-xs text-gray-500">Day</label>
                  <select className="border rounded-md p-2 text-sm" value={row.day} onChange={(e) => setLoops((prev) => prev.map((x) => (x.weekIndex === row.weekIndex ? { ...x, day: e.target.value as Day } : x)))}>
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-gray-500">Start</label>
                  <input type="time" className="border rounded-md p-2 text-sm" value={row.startTime} onChange={(e) => setLoops((prev) => prev.map((x) => (x.weekIndex === row.weekIndex ? { ...x, startTime: e.target.value } : x)))} />
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-gray-500">Duration (min)</label>
                  <input type="number" min={1} className="border rounded-md p-2 text-sm" value={row.durationMinutes} onChange={(e) => setLoops((prev) => prev.map((x) => (x.weekIndex === row.weekIndex ? { ...x, durationMinutes: Number(e.target.value) } : x)))} />
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-gray-500">Class</label>
                  <select className="border rounded-md p-2 text-sm" value={row.classId} onChange={(e) => setLoops((prev) => prev.map((x) => (x.weekIndex === row.weekIndex ? { ...x, classId: Number(e.target.value) } : x)))}>
                    {props.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-gray-500">Subject</label>
                  <select className="border rounded-md p-2 text-sm" value={row.subjectId} onChange={(e) => setLoops((prev) => prev.map((x) => (x.weekIndex === row.weekIndex ? { ...x, subjectId: Number(e.target.value) } : x)))}>
                    {props.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-gray-500">Room (optional)</label>
                  <select className="border rounded-md p-2 text-sm" value={row.roomId ?? ""} onChange={(e) => setLoops((prev) => prev.map((x) => (x.weekIndex === row.weekIndex ? { ...x, roomId: e.target.value ? Number(e.target.value) : null } : x)))}>
                    <option value="">Auto/Any</option>
                    {props.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-gray-500">Teacher (optional)</label>
                  <select className="border rounded-md p-2 text-sm" value={row.teacherId ?? ""} onChange={(e) => setLoops((prev) => prev.map((x) => (x.weekIndex === row.weekIndex ? { ...x, teacherId: e.target.value ? e.target.value : null } : x)))}>
                    <option value="">Auto/Any</option>
                    {props.teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.surname}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {preview && (
        <div className="bg-white rounded-md border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold">Preview</h2>
            <div className="text-xs text-gray-500">requestId: {preview.requestId}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-md bg-green-50 border border-green-200">
              <div className="text-xs text-green-800">Would create</div>
              <div className="text-lg font-semibold text-green-900">{preview.summary.wouldCreate}</div>
            </div>
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
              <div className="text-xs text-amber-800">Skipped</div>
              <div className="text-lg font-semibold text-amber-900">{preview.summary.skipped}</div>
            </div>
            <div className="p-3 rounded-md bg-red-50 border border-red-200">
              <div className="text-xs text-red-800">Conflicted</div>
              <div className="text-lg font-semibold text-red-900">{preview.summary.conflicted}</div>
            </div>
          </div>

          <div className="space-y-4">
            {weekKeys.map((wk) => (
              <div key={wk} className="border rounded-md overflow-hidden">
                <div className="p-3 bg-gray-100 flex items-center justify-between">
                  <p className="font-medium">Week {wk + 1}</p>
                  <span className="text-xs text-gray-500">{preview.groupedByWeekIndex[wk]?.length ?? 0} occurrences</span>
                </div>
                <div className="divide-y">
                  {(preview.groupedByWeekIndex[wk] ?? []).map((occ) => (
                    <div key={occ.occurrenceIndex} className="p-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{formatDateTime(occ.startTime)} - {formatDateTime(occ.endTime)}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {occ.status === "create" ? "Ready to create" : `Reason: ${occ.reason ?? "—"}`}
                        </div>
                      </div>
                      <div className="text-xs">
                        {occ.status === "create" && <span className="px-2 py-1 rounded bg-green-600 text-white">Create</span>}
                        {occ.status === "skip" && <span className="px-2 py-1 rounded bg-amber-500 text-white">Skipped</span>}
                        {occ.status === "conflict" && <span className="px-2 py-1 rounded bg-red-600 text-white">Conflict</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

