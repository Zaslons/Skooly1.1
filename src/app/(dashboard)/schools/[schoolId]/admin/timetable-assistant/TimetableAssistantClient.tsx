"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { LessonDeliveryMode } from "@prisma/client";
import { TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX, type TimetableAssistantBody } from "@/lib/formValidationSchemas";
import { getClassCurriculumPeriodsAction } from "@/lib/actions/classCurriculumPeriodsActions";

type PreviewSource = "greedy" | "optimize";

function toastPreviewApiError(data: { code?: string; error?: string } | null, fallback: string) {
  const code = data?.code;
  const err = data?.error ?? fallback;
  if (code === "SOLVER_DISABLED" || code === "SOLVER_UNAVAILABLE") {
    toast.error(
      `${err} On the server, set TIMETABLE_SOLVER_ENABLED=1, TIMETABLE_SOLVER_URL, and TIMETABLE_SOLVER_SECRET (see docs/timetable/TIMETABLE_ASSISTANT_MVP.md).`
    );
    return;
  }
  toast.error(err);
}

type Row = {
  subjectId: string;
  teacherId: string;
  periodsPerWeek: string;
  blockSize: string;
  roomId: string;
  deliveryMode: LessonDeliveryMode;
  meetingUrl: string;
  meetingLabel: string;
};

type PreviewPayload = {
  preview: {
    proposals: Array<{
      day: string;
      periodName: string;
      name: string;
      startTime: string;
      endTime: string;
      subjectId: number;
      teacherId: string;
    }>;
    unplaced: unknown[];
    totalRequiredSlots: number;
    totalAvailableSlots: number;
  };
  className: string;
  periods: Array<{ id: string; name: string; order: number }>;
  policyErrors: string[];
};

const emptyRow = (): Row => ({
  subjectId: "",
  teacherId: "",
  periodsPerWeek: "1",
  blockSize: "1",
  roomId: "",
  deliveryMode: LessonDeliveryMode.IN_PERSON,
  meetingUrl: "",
  meetingLabel: "",
});

const TimetableAssistantClient = ({
  schoolId,
  classes,
  subjects,
  teachers,
  rooms,
  hasBellPeriods,
  optimizerEnabled,
}: {
  schoolId: string;
  classes: { id: number; label: string }[];
  subjects: { id: number; name: string }[];
  teachers: { id: string; name: string; surname: string; subjectIds: number[] }[];
  rooms: { id: number; name: string }[];
  hasBellPeriods: boolean;
  optimizerEnabled: boolean;
}) => {
  const router = useRouter();
  const [classId, setClassId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  /** Cleared when a new greedy preview runs (stale optimize would mislead comparison). */
  const [greedyPreview, setGreedyPreview] = useState<PreviewPayload | null>(null);
  const [optimizePreview, setOptimizePreview] = useState<PreviewPayload | null>(null);
  const [activeSource, setActiveSource] = useState<PreviewSource>("greedy");
  const [loadingMode, setLoadingMode] = useState<"idle" | "greedy" | "optimize">("idle");
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [fillingPeriods, setFillingPeriods] = useState(false);

  const loading = loadingMode !== "idle" || committing || fillingPeriods;

  const teachersBySubject = useCallback(
    (subjectId: number) => teachers.filter((t) => t.subjectIds.includes(subjectId)),
    [teachers]
  );

  const buildBody = useCallback((): TimetableAssistantBody | null => {
    const cid = Number.parseInt(classId, 10);
    if (Number.isNaN(cid)) {
      toast.error("Select a class.");
      return null;
    }
    const requirements = rows
      .map((r) => {
        const sid = Number.parseInt(r.subjectId, 10);
        const ppw = Number.parseInt(r.periodsPerWeek, 10);
        const roomRaw = r.roomId.trim();
        const roomId = roomRaw === "" ? null : Number.parseInt(roomRaw, 10);
        const bs = Number.parseInt(r.blockSize, 10);
        if (Number.isNaN(sid) || !r.teacherId || Number.isNaN(ppw) || ppw < 1) return null;
        if (roomRaw !== "" && Number.isNaN(roomId)) return null;
        if (Number.isNaN(bs) || bs < 1 || bs > TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX) return null;
        const online = r.deliveryMode === LessonDeliveryMode.ONLINE;
        const base = {
          subjectId: sid,
          teacherId: r.teacherId,
          periodsPerWeek: ppw,
          blockSize: bs,
          roomId: online ? null : roomId,
        };
        if (online) {
          return {
            ...base,
            deliveryMode: LessonDeliveryMode.ONLINE,
            meetingUrl: r.meetingUrl.trim() || null,
            meetingLabel: r.meetingLabel.trim() || null,
          };
        }
        return base;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (requirements.length === 0) {
      toast.error("Add at least one valid requirement row.");
      return null;
    }

    return {
      classId: cid,
      requirements,
      replaceExistingClassLessons: replaceExisting,
    };
  }, [classId, rows, replaceExisting]);

  const runPreviewGreedy = async () => {
    const body = buildBody();
    if (!body) return;
    setLoadingMode("greedy");
    setGreedyPreview(null);
    setOptimizePreview(null);
    setCommitted(false);
    try {
      const res = await fetch(`/api/schools/${schoolId}/timetable-assistant/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toastPreviewApiError(data, "Preview failed.");
        return;
      }
      setGreedyPreview(data as PreviewPayload);
      setActiveSource("greedy");
      if (data.policyErrors?.length) {
        toast.warn("Bell policy warnings — fix before commit.");
      } else {
        toast.success("Greedy preview ready.");
      }
    } finally {
      setLoadingMode("idle");
    }
  };

  const runPreviewOptimize = async () => {
    const body = buildBody();
    if (!body) return;
    setLoadingMode("optimize");
    setCommitted(false);
    try {
      const res = await fetch(`/api/schools/${schoolId}/timetable-assistant/preview-optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toastPreviewApiError(data, "CP-SAT preview failed.");
        return;
      }
      setOptimizePreview(data as PreviewPayload);
      setActiveSource("optimize");
      if (data.policyErrors?.length) {
        toast.warn("Bell policy warnings — fix before commit.");
      } else {
        toast.success("CP-SAT preview ready.");
      }
    } finally {
      setLoadingMode("idle");
    }
  };

  const activePreview = useMemo(() => {
    if (activeSource === "greedy" && greedyPreview) return greedyPreview;
    if (activeSource === "optimize" && optimizePreview) return optimizePreview;
    return greedyPreview ?? optimizePreview ?? null;
  }, [activeSource, greedyPreview, optimizePreview]);

  const runCommit = async () => {
    const body = buildBody();
    if (!body) return;
    const preview = activePreview;
    if (!preview || preview.preview.unplaced.length > 0 || preview.policyErrors.length > 0) {
      toast.error("Run a successful preview with no unplaced slots and no policy errors first.");
      return;
    }
    if (!window.confirm("Create weekly lesson templates for this class?")) return;
    setCommitting(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/timetable-assistant/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Commit failed.");
        return;
      }
      toast.success(`Created ${data.createdCount} lesson template(s).`);
      setCommitted(true);
      router.refresh();
    } finally {
      setCommitting(false);
    }
  };

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx));

  const slotSummary = useMemo(() => {
    if (!activePreview) return null;
    return `${activePreview.preview.proposals.length} / ${activePreview.preview.totalRequiredSlots} placed · ${activePreview.preview.totalAvailableSlots} slots available (Mon–Fri × periods)`;
  }, [activePreview]);

  const showCompareTabs = Boolean(greedyPreview && optimizePreview);

  if (!hasBellPeriods) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Timetable assistant</h1>
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-4">
          Configure an active bell schedule first.{" "}
          <Link href={`/schools/${schoolId}/admin/setup/bell-schedule`} className="underline font-medium">
            Bell schedule
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Timetable assistant</h1>
        <p className="text-sm text-gray-600 mt-1">
          Draft weekly <span className="font-medium">lesson templates</span> for one class using a simple placement
          rule. Then run{" "}
          <Link href={`/schools/${schoolId}/admin/schedule`} className="text-indigo-700 underline font-medium">
            Generate lesson sessions for this term
          </Link>{" "}
          on the admin schedule. See <code className="text-xs bg-gray-100 px-1 rounded">docs/timetable/TIMETABLE_ASSISTANT_MVP.md</code> in the repository.{" "}
          <Link href={`/schools/${schoolId}/admin/timetable-assistant/school`} className="text-indigo-700 underline font-medium">
            Advanced: whole-school draft
          </Link>
        </p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Class</label>
        <select
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">Select class…</option>
          {classes.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={loading || !classId}
          onClick={() => void (async () => {
            const cid = Number.parseInt(classId, 10);
            if (Number.isNaN(cid)) {
              toast.error("Select a class first.");
              return;
            }
            setFillingPeriods(true);
            try {
              const res = await getClassCurriculumPeriodsAction({ schoolId, classId: cid });
              if (!res.success) {
                toast.error(res.message);
                return;
              }
              if (res.periods.length === 0) {
                toast.info(
                  "No periods/week set on curriculum for this class’s grade and year. Set them under Curriculum management."
                );
                return;
              }
              const bySubject = new Map(res.periods.map((p) => [p.subjectId, p.periodsPerWeek]));
              setRows((prev) =>
                prev.map((row) => {
                  const sid = Number.parseInt(row.subjectId, 10);
                  if (Number.isNaN(sid)) return row;
                  const ppw = bySubject.get(sid);
                  if (ppw == null || ppw < 1) return row;
                  return { ...row, periodsPerWeek: String(ppw) };
                })
              );
              toast.success("Filled periods/week from curriculum where available.");
            } finally {
              setFillingPeriods(false);
            }
          })()}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {fillingPeriods ? "Loading…" : "Fill periods from curriculum"}
        </button>
        <span className="text-xs text-gray-500">
          Uses non-empty <strong>Periods per week</strong> on curriculum for this class’s grade and academic year.
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            Requirements (subject · teacher · periods/week · block · room · delivery · optional meeting link)
          </span>
          <button type="button" onClick={addRow} className="text-sm text-indigo-700 underline">
            Add row
          </button>
        </div>
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Subject</th>
                <th className="text-left p-2">Teacher</th>
                <th className="text-left p-2">Periods / week</th>
                <th className="text-left p-2">Block</th>
                <th className="text-left p-2">Room</th>
                <th className="text-left p-2">Delivery</th>
                <th className="text-left p-2 min-w-[9rem]">Meeting URL</th>
                <th className="text-left p-2 min-w-[6rem]">Label</th>
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const sid = Number.parseInt(row.subjectId, 10);
                const eligible = Number.isNaN(sid) ? [] : teachersBySubject(sid);
                const isOnline = row.deliveryMode === LessonDeliveryMode.ONLINE;
                return (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <select
                        className="w-full rounded border border-gray-200 px-2 py-1"
                        value={row.subjectId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((rs) =>
                            rs.map((r, i) => (i === idx ? { ...r, subjectId: v, teacherId: "" } : r))
                          );
                        }}
                      >
                        <option value="">Subject…</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        className="w-full rounded border border-gray-200 px-2 py-1"
                        value={row.teacherId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, teacherId: v } : r)));
                        }}
                        disabled={!row.subjectId}
                      >
                        <option value="">Teacher…</option>
                        {eligible.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.surname}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={1}
                        max={40}
                        className="w-20 rounded border border-gray-200 px-2 py-1"
                        value={row.periodsPerWeek}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, periodsPerWeek: v } : r)));
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className="w-full min-w-[4rem] rounded border border-gray-200 px-2 py-1"
                        value={row.blockSize}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, blockSize: v } : r)));
                        }}
                        title="Consecutive periods in one block"
                      >
                        {Array.from({ length: TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={String(n)}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        className="w-full rounded border border-gray-200 px-2 py-1 disabled:opacity-50"
                        value={row.roomId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, roomId: v } : r)));
                        }}
                        disabled={isOnline}
                      >
                        <option value="">Any</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={String(r.id)}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        className="w-full min-w-[7rem] rounded border border-gray-200 px-2 py-1 text-xs"
                        value={row.deliveryMode}
                        onChange={(e) => {
                          const v = e.target.value as LessonDeliveryMode;
                          setRows((rs) =>
                            rs.map((r, i) =>
                              i === idx
                                ? {
                                    ...r,
                                    deliveryMode: v,
                                    roomId: v === LessonDeliveryMode.ONLINE ? "" : r.roomId,
                                    meetingUrl: v === LessonDeliveryMode.IN_PERSON ? "" : r.meetingUrl,
                                    meetingLabel: v === LessonDeliveryMode.IN_PERSON ? "" : r.meetingLabel,
                                  }
                                : r
                            )
                          );
                        }}
                      >
                        <option value={LessonDeliveryMode.IN_PERSON}>In person</option>
                        <option value={LessonDeliveryMode.ONLINE}>Online</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="url"
                        className="w-full min-w-[8rem] rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-50"
                        placeholder="https://…"
                        value={row.meetingUrl}
                        disabled={!isOnline}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, meetingUrl: v } : r)));
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-50"
                        placeholder="Zoom…"
                        value={row.meetingLabel}
                        disabled={!isOnline}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, meetingLabel: v } : r)));
                        }}
                      />
                    </td>
                    <td className="p-2">
                      {rows.length > 1 && (
                        <button type="button" className="text-red-600 text-xs" onClick={() => removeRow(idx)}>
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={replaceExisting}
          onChange={(e) => setReplaceExisting(e.target.checked)}
        />
        Replace existing weekly templates for this class
      </label>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          disabled={loading}
          onClick={() => void runPreviewGreedy()}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {loadingMode === "greedy" ? "Working…" : optimizerEnabled ? "Preview (greedy)" : "Preview"}
        </button>
        {optimizerEnabled && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void runPreviewOptimize()}
            className="px-4 py-2 rounded-md bg-violet-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {loadingMode === "optimize" ? "Working…" : "Preview (CP-SAT)"}
          </button>
        )}
        <button
          type="button"
          disabled={loading || !activePreview}
          onClick={() => void runCommit()}
          className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {committing ? "Committing…" : "Commit"}
        </button>
      </div>
      {optimizerEnabled && (
        <p className="text-xs text-gray-600 max-w-3xl">
          <span className="font-medium">Greedy</span> is fast and deterministic.{" "}
          <span className="font-medium">CP-SAT</span> respects the same hard rules and minimizes soft goals (spread,
          gaps, rooms — see{" "}
          <code className="text-[0.7rem] bg-gray-100 px-1 rounded">docs/timetable/TIMETABLE_SOLVER_F3_IMPLEMENTATION.md</code>
          ); may take up to ~30s. Results can differ; use the tabs below to compare when both previews exist. Commit uses
          whichever preview is selected.
        </p>
      )}
      {!optimizerEnabled && (
        <p className="text-xs text-gray-700 max-w-3xl bg-gray-50 border border-gray-200 rounded-md p-3">
          <span className="font-medium text-gray-900">CP-SAT solver not shown</span> — Set{" "}
          <code className="text-[0.7rem] bg-white px-1 rounded border">TIMETABLE_SOLVER_ENABLED=1</code> in{" "}
          <code className="text-[0.7rem] bg-white px-1 rounded border">.env</code>, configure{" "}
          <code className="text-[0.7rem] bg-white px-1 rounded border">TIMETABLE_SOLVER_URL</code> and{" "}
          <code className="text-[0.7rem] bg-white px-1 rounded border">TIMETABLE_SOLVER_SECRET</code>, run the Python
          service (<code className="text-[0.7rem] bg-white px-1 rounded border">services/timetable-solver/</code>), then
          restart the dev server. <strong>Preview (CP-SAT)</strong> will appear next to Preview (greedy).
        </p>
      )}

      {activePreview && (
        <div className="space-y-3 border rounded-md p-4 bg-gray-50">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Preview — {activePreview.className}</h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {activeSource === "optimize" && optimizePreview
                  ? "CP-SAT placement (soft goals)"
                  : "Greedy placement"}
              </p>
            </div>
            {slotSummary && <span className="text-xs text-gray-600">{slotSummary}</span>}
          </div>
          {showCompareTabs && (
            <div className="flex rounded-md border border-gray-200 bg-white p-0.5 w-fit text-sm">
              <button
                type="button"
                className={`px-3 py-1 rounded ${activeSource === "greedy" ? "bg-indigo-100 font-medium text-indigo-900" : "text-gray-600"}`}
                onClick={() => setActiveSource("greedy")}
              >
                Greedy
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded ${activeSource === "optimize" ? "bg-violet-100 font-medium text-violet-900" : "text-gray-600"}`}
                onClick={() => setActiveSource("optimize")}
              >
                CP-SAT
              </button>
            </div>
          )}
          {activePreview.policyErrors.length > 0 && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
              <p className="font-medium">Policy errors (must be empty to commit)</p>
              <ul className="list-disc pl-5 mt-1">
                {activePreview.policyErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {activePreview.preview.unplaced.length > 0 && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded p-2">
              <p className="font-medium">Unplaced slots</p>
              <p>Reduce periods per week or resolve conflicts, then preview again.</p>
            </div>
          )}
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-1">Day</th>
                  <th className="p-1">Period</th>
                  <th className="p-1">Lesson</th>
                  <th className="p-1">Start</th>
                  <th className="p-1">End</th>
                </tr>
              </thead>
              <tbody>
                {activePreview.preview.proposals.map((p, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="p-1">{p.day}</td>
                    <td className="p-1">{p.periodName}</td>
                    <td className="p-1">{p.name}</td>
                    <td className="p-1">{new Date(p.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="p-1">{new Date(p.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {committed && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-medium">Templates saved.</p>
          <p className="mt-1">
            Open{" "}
            <Link href={`/schools/${schoolId}/admin/schedule`} className="underline font-medium">
              Admin schedule
            </Link>{" "}
            and use <strong>Generate lesson sessions for this term</strong> if needed.
          </p>
        </div>
      )}
    </div>
  );
};

export default TimetableAssistantClient;
