"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import {
  TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX,
  type TimetableAssistantSchoolBody,
  type TimetableAssistantSchoolTemplateRow,
} from "@/lib/formValidationSchemas";
import { LessonDeliveryMode } from "@prisma/client";
import {
  TIMETABLE_SCHOOL_MAX_REQUIREMENTS,
  applyGradeTemplateToClasses,
  cellKey,
  countWouldExceedCap,
  flatRowCountExceedsCap,
  flatRowsToMatrix,
  matrixToFlatRows,
  matrixToTemplateRows,
  mergeFlatLastWins,
  type MatrixGridState,
  type SchoolRequirementFlat,
} from "@/lib/domain/timetableRequirementMatrix";

type PreviewSource = "greedy" | "optimize";

function toastSchoolPreviewApiError(data: { code?: string; error?: string } | null, fallback: string) {
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

type ScopeMode = "school" | "grade" | "classIds";

type SchoolRow = {
  classId: string;
  subjectId: string;
  teacherId: string;
  periodsPerWeek: string;
  blockSize: string;
  roomId: string;
  deliveryMode: LessonDeliveryMode;
  meetingUrl: string;
  meetingLabel: string;
};

type SchoolPreviewPayload = {
  preview: {
    proposals: Array<{
      day: string;
      periodName: string;
      name: string;
      startTime: string;
      endTime: string;
      subjectId: number;
      teacherId: string;
      classId: number;
    }>;
    unplaced: unknown[];
    totalRequiredSlots: number;
    totalAvailableSlots: number;
  };
  periods: Array<{ id: string; name: string; order: number }>;
  policyErrors: string[];
  summary: {
    placedByClass: Record<string, number>;
    unplacedByClass: Record<string, number>;
    totalProposals: number;
    totalUnplaced: number;
    scopeClassCount: number;
    totalRequiredSlots: number;
    totalAvailableSlotsPerClassWeek: number;
  };
  classNameById: Record<string, string>;
};

const emptyRow = (): SchoolRow => ({
  classId: "",
  subjectId: "",
  teacherId: "",
  periodsPerWeek: "1",
  blockSize: "1",
  roomId: "",
  deliveryMode: LessonDeliveryMode.IN_PERSON,
  meetingUrl: "",
  meetingLabel: "",
});

function parseTableRowsToFlat(rows: SchoolRow[]): SchoolRequirementFlat[] {
  const out: SchoolRequirementFlat[] = [];
  for (const r of rows) {
    const cid = Number.parseInt(r.classId, 10);
    const sid = Number.parseInt(r.subjectId, 10);
    const ppw = Number.parseInt(r.periodsPerWeek, 10);
    const roomRaw = r.roomId.trim();
    const roomId = roomRaw === "" ? null : Number.parseInt(roomRaw, 10);
    const bs = Number.parseInt(r.blockSize, 10);
    if (Number.isNaN(cid) || Number.isNaN(sid) || !r.teacherId || Number.isNaN(ppw) || ppw < 1) continue;
    if (roomRaw !== "" && Number.isNaN(roomId)) continue;
    if (Number.isNaN(bs) || bs < 1 || bs > TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX) continue;
    const online = r.deliveryMode === LessonDeliveryMode.ONLINE;
    out.push({
      classId: cid,
      subjectId: sid,
      teacherId: r.teacherId,
      periodsPerWeek: ppw,
      blockSize: bs,
      roomId: online ? null : roomId,
      deliveryMode: online ? LessonDeliveryMode.ONLINE : LessonDeliveryMode.IN_PERSON,
      meetingUrl: online ? (r.meetingUrl.trim() || null) : null,
      meetingLabel: online ? (r.meetingLabel.trim() || null) : null,
    });
  }
  return out;
}

function schoolFlatToSchoolRows(flat: SchoolRequirementFlat[]): SchoolRow[] {
  return flat.map((f) => ({
    classId: String(f.classId),
    subjectId: String(f.subjectId),
    teacherId: f.teacherId,
    periodsPerWeek: String(f.periodsPerWeek),
    blockSize: String(f.blockSize),
    roomId: f.roomId == null ? "" : String(f.roomId),
    deliveryMode: f.deliveryMode ?? LessonDeliveryMode.IN_PERSON,
    meetingUrl: f.meetingUrl ?? "",
    meetingLabel: f.meetingLabel ?? "",
  }));
}

function createEmptyMatrixState(
  scopeIds: number[],
  subjectIds: number[],
  pickFirstTeacherId: (subjectId: number) => string | undefined
): MatrixGridState {
  const columnTeacherBySubject: Record<number, string> = {};
  for (const sid of subjectIds) {
    const t = pickFirstTeacherId(sid);
    if (t) columnTeacherBySubject[sid] = t;
  }
  const cells: MatrixGridState["cells"] = {};
  for (const cid of scopeIds) {
    for (const sid of subjectIds) {
      cells[cellKey(cid, sid)] = { periodsPerWeek: 0, teacherIdOverride: null };
    }
  }
  return {
    columnTeacherBySubject,
    cells,
    globalBlockSize: 1,
    globalRoomId: null,
    subjectIds: [...subjectIds],
  };
}

function sameSortedIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

const TimetableAssistantSchoolClient = ({
  schoolId,
  grades,
  classes,
  subjects,
  teachers,
  rooms,
  hasBellPeriods,
  optimizerEnabled,
}: {
  schoolId: string;
  grades: { id: number; level: string }[];
  classes: { id: number; name: string; gradeId: number; label: string }[];
  subjects: { id: number; name: string }[];
  teachers: { id: string; name: string; surname: string; subjectIds: number[] }[];
  rooms: { id: number; name: string }[];
  hasBellPeriods: boolean;
  optimizerEnabled: boolean;
}) => {
  const router = useRouter();
  const [scopeMode, setScopeMode] = useState<ScopeMode>("school");
  const [gradeId, setGradeId] = useState<string>("");
  const [pickedClassIds, setPickedClassIds] = useState<number[]>([]);
  const [rows, setRows] = useState<SchoolRow[]>([emptyRow()]);
  const [uiMode, setUiMode] = useState<"table" | "matrix">("table");
  const [matrixState, setMatrixState] = useState<MatrixGridState | null>(null);
  /** Empty = all subjects as matrix columns */
  const [subjectColumnFilter, setSubjectColumnFilter] = useState<number[]>([]);
  const [templateGradeId, setTemplateGradeId] = useState<string>("");
  const [templateApplyMode, setTemplateApplyMode] = useState<"replace" | "merge">("replace");
  const lastScopeIdsRef = useRef<number[]>([]);
  const [replaceScope, setReplaceScope] = useState<TimetableAssistantSchoolBody["replaceScope"]>("none");
  const [greedyPreview, setGreedyPreview] = useState<SchoolPreviewPayload | null>(null);
  const [optimizePreview, setOptimizePreview] = useState<SchoolPreviewPayload | null>(null);
  const [activeSource, setActiveSource] = useState<PreviewSource>("greedy");
  const [loadingMode, setLoadingMode] = useState<"idle" | "greedy" | "optimize">("idle");
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [filterClassId, setFilterClassId] = useState<string>("");
  const [filterTeacherId, setFilterTeacherId] = useState<string>("");

  const loading = loadingMode !== "idle" || committing;

  const teachersBySubject = useCallback(
    (subjectId: number) => teachers.filter((t) => t.subjectIds.includes(subjectId)),
    [teachers]
  );

  const classesInScope = useMemo(() => {
    if (scopeMode === "school") return classes;
    if (scopeMode === "grade") {
      const gid = Number.parseInt(gradeId, 10);
      if (Number.isNaN(gid)) return [];
      return classes.filter((c) => c.gradeId === gid);
    }
    return classes.filter((c) => pickedClassIds.includes(c.id));
  }, [classes, scopeMode, gradeId, pickedClassIds]);

  const scopeClassIds = useMemo(() => classesInScope.map((c) => c.id), [classesInScope]);
  const scopeClassIdsKey = useMemo(() => scopeClassIds.join(","), [scopeClassIds]);

  const matrixSubjectIds = useMemo(() => {
    if (subjectColumnFilter.length > 0) return subjectColumnFilter;
    return subjects.map((s) => s.id);
  }, [subjectColumnFilter, subjects]);

  const matrixSubjectIdsKey = useMemo(() => matrixSubjectIds.join(","), [matrixSubjectIds]);

  useEffect(() => {
    if (uiMode !== "matrix") {
      lastScopeIdsRef.current = scopeClassIds;
      return;
    }
    const newIds = scopeClassIds;
    const oldIds = lastScopeIdsRef.current;
    if (sameSortedIds(newIds, oldIds)) return;
    lastScopeIdsRef.current = newIds;
    setMatrixState((prev) => {
      if (!prev) return prev;
      const flatRes = matrixToFlatRows(prev, oldIds.length ? oldIds : newIds);
      if (!flatRes.ok) return prev;
      const filtered = flatRes.rows.filter((r) => newIds.includes(r.classId));
      return flatRowsToMatrix(filtered, newIds, prev.subjectIds);
    });
  }, [scopeClassIds, uiMode]);

  useEffect(() => {
    if (uiMode !== "matrix") return;
    setMatrixState((prev) => {
      if (!prev) return prev;
      const nextSubjects = matrixSubjectIds;
      if (sameSortedIds(nextSubjects, prev.subjectIds)) return prev;
      const flatRes = matrixToFlatRows(prev, scopeClassIds);
      if (!flatRes.ok) return prev;
      return flatRowsToMatrix(flatRes.rows, scopeClassIds, nextSubjects);
    });
  }, [matrixSubjectIdsKey, uiMode, scopeClassIdsKey]);

  const buildScope = useCallback((): TimetableAssistantSchoolBody["scope"] | null => {
    if (scopeMode === "school") return { type: "school" };
    if (scopeMode === "grade") {
      const gid = Number.parseInt(gradeId, 10);
      if (Number.isNaN(gid)) {
        toast.error("Select a grade.");
        return null;
      }
      return { type: "grade", gradeId: gid };
    }
    if (pickedClassIds.length === 0) {
      toast.error("Select at least one class for this scope.");
      return null;
    }
    return { type: "classIds", ids: pickedClassIds };
  }, [scopeMode, gradeId, pickedClassIds]);

  const buildBody = useCallback((): TimetableAssistantSchoolBody | null => {
    const scope = buildScope();
    if (!scope) return null;

    let requirements: TimetableAssistantSchoolBody["requirements"];

    if (uiMode === "matrix") {
      if (!matrixState) {
        toast.error("Matrix is not ready. Switch to Matrix again.");
        return null;
      }
      const res = matrixToFlatRows(matrixState, scopeClassIds);
      if (!res.ok) {
        toast.error(res.message);
        return null;
      }
      requirements = res.rows.map((r) => ({
        classId: r.classId,
        subjectId: r.subjectId,
        teacherId: r.teacherId,
        periodsPerWeek: r.periodsPerWeek,
        blockSize: r.blockSize,
        roomId: r.roomId ?? null,
      }));
      if (requirements.length === 0) {
        toast.error("Add at least one cell with periods > 0, or switch to table mode.");
        return null;
      }
    } else {
      const flat = parseTableRowsToFlat(rows);
      requirements = flat.map((r) => {
        const base = {
          classId: r.classId,
          subjectId: r.subjectId,
          teacherId: r.teacherId,
          periodsPerWeek: r.periodsPerWeek,
          blockSize: r.blockSize,
          roomId: r.roomId ?? null,
        };
        if (r.deliveryMode === LessonDeliveryMode.ONLINE) {
          return {
            ...base,
            deliveryMode: LessonDeliveryMode.ONLINE,
            meetingUrl: r.meetingUrl ?? null,
            meetingLabel: r.meetingLabel ?? null,
          };
        }
        return base;
      });

      if (requirements.length === 0) {
        toast.error("Add at least one valid requirement row.");
        return null;
      }
    }

    return {
      scope,
      requirements,
      replaceScope,
    };
  }, [buildScope, rows, replaceScope, uiMode, matrixState, scopeClassIds]);

  const switchToMatrix = useCallback(() => {
    const ids = classesInScope.map((c) => c.id);
    if (ids.length === 0) {
      toast.error("No classes in scope. Adjust scope first.");
      return;
    }
    const flat = parseTableRowsToFlat(rows);
    const subj = matrixSubjectIds;
    lastScopeIdsRef.current = ids;
    if (flat.length === 0) {
      setMatrixState(
        createEmptyMatrixState(ids, subj, (sid) => teachersBySubject(sid)[0]?.id)
      );
    } else {
      setMatrixState(flatRowsToMatrix(flat, ids, subj));
    }
    setUiMode("matrix");
  }, [classesInScope, rows, matrixSubjectIds, teachersBySubject]);

  const switchToTable = useCallback(() => {
    if (!matrixState) {
      setUiMode("table");
      return;
    }
    const res = matrixToFlatRows(matrixState, scopeClassIds);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    const asRows = schoolFlatToSchoolRows(res.rows);
    setRows(asRows.length ? asRows : [emptyRow()]);
    setUiMode("table");
  }, [matrixState, scopeClassIds]);

  const saveGradeTemplate = async () => {
    const gid = Number.parseInt(templateGradeId, 10);
    if (Number.isNaN(gid)) {
      toast.error("Choose a grade for this template.");
      return;
    }
    if (!matrixState) {
      toast.error("Use matrix mode to define the template from the grid (prototype = first class row).");
      return;
    }
    const proto = classesInScope[0]?.id;
    if (!proto) {
      toast.error("No classes in scope.");
      return;
    }
    const templateRows = matrixToTemplateRows(matrixState, proto);
    try {
      const res = await fetch(`/api/schools/${schoolId}/timetable-assistant/grade-templates/${gid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowsJson: templateRows }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Save failed.");
        return;
      }
      toast.success("Template saved.");
    } catch {
      toast.error("Save failed.");
    }
  };

  const loadGradeTemplate = async () => {
    const gid = Number.parseInt(templateGradeId, 10);
    if (Number.isNaN(gid)) {
      toast.error("Choose a grade.");
      return;
    }
    try {
      const res = await fetch(`/api/schools/${schoolId}/timetable-assistant/grade-templates/${gid}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Load failed.");
        return;
      }
      const templateRows = (data.rowsJson ?? []) as TimetableAssistantSchoolTemplateRow[];
      const ids = classesInScope.map((c) => c.id);
      if (ids.length === 0) {
        toast.error("No classes in scope.");
        return;
      }
      const subjIds =
        templateRows.length > 0
          ? Array.from(new Set(templateRows.map((r) => r.subjectId)))
          : matrixSubjectIds;
      const flat = applyGradeTemplateToClasses(templateRows, ids);
      lastScopeIdsRef.current = ids;
      setMatrixState(flatRowsToMatrix(flat, ids, subjIds));
      setUiMode("matrix");
      toast.success("Template loaded into the matrix.");
    } catch {
      toast.error("Load failed.");
    }
  };

  const applyGradeTemplateFromServer = async () => {
    const gid = Number.parseInt(templateGradeId, 10);
    if (Number.isNaN(gid)) {
      toast.error("Choose a grade.");
      return;
    }
    try {
      const res = await fetch(`/api/schools/${schoolId}/timetable-assistant/grade-templates/${gid}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to fetch template.");
        return;
      }
      const templateRows = (data.rowsJson ?? []) as TimetableAssistantSchoolTemplateRow[];
      const ids = classesInScope.map((c) => c.id);
      if (ids.length === 0) {
        toast.error("No classes in scope.");
        return;
      }
      if (templateRows.length === 0) {
        toast.error("Template is empty.");
        return;
      }
      if (countWouldExceedCap(ids.length, templateRows.length)) {
        toast.error(
          `Applying would create ${ids.length * templateRows.length} rows (max ${TIMETABLE_SCHOOL_MAX_REQUIREMENTS}). Narrow scope or the template.`
        );
        return;
      }
      const expanded = applyGradeTemplateToClasses(templateRows, ids);
      if (flatRowCountExceedsCap(expanded.length)) {
        toast.error(`Too many rows (max ${TIMETABLE_SCHOOL_MAX_REQUIREMENTS}).`);
        return;
      }
      const subjIds = Array.from(
        new Set([...matrixSubjectIds, ...expanded.map((r) => r.subjectId)])
      );

      if (templateApplyMode === "replace") {
        if (!window.confirm("Replace current requirements with this template for every class in scope?")) return;
        if (uiMode === "matrix") {
          setMatrixState(flatRowsToMatrix(expanded, ids, subjIds));
        } else {
          setRows(schoolFlatToSchoolRows(expanded));
        }
      } else {
        if (!window.confirm("Merge template into current requirements? Same class + subject pairs are overwritten by the template."))
          return;
        if (uiMode === "matrix") {
          if (!matrixState) {
            toast.error("Matrix is not loaded. Switch to Matrix or use table mode.");
            return;
          }
          const cur = matrixToFlatRows(matrixState, ids);
          if (!cur.ok) {
            toast.error(cur.message);
            return;
          }
          const merged = mergeFlatLastWins(cur.rows, expanded);
          setMatrixState(flatRowsToMatrix(merged, ids, subjIds));
        } else {
          const cur = parseTableRowsToFlat(rows);
          const merged = mergeFlatLastWins(cur, expanded);
          setRows(merged.length ? schoolFlatToSchoolRows(merged) : [emptyRow()]);
        }
      }
      toast.success("Template applied.");
    } catch {
      toast.error("Apply failed.");
    }
  };

  const runPreviewGreedy = async () => {
    const body = buildBody();
    if (!body) return;
    setLoadingMode("greedy");
    setGreedyPreview(null);
    setOptimizePreview(null);
    setCommitted(false);
    try {
      const res = await fetch(`/api/schools/${schoolId}/timetable-assistant/preview-school`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toastSchoolPreviewApiError(data, "Preview failed.");
        return;
      }
      setGreedyPreview(data as SchoolPreviewPayload);
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
      const res = await fetch(`/api/schools/${schoolId}/timetable-assistant/preview-optimize-school`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toastSchoolPreviewApiError(data, "CP-SAT preview failed.");
        return;
      }
      setOptimizePreview(data as SchoolPreviewPayload);
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

  const showCompareTabs = Boolean(greedyPreview && optimizePreview);

  const confirmCommitMessage = () => {
    if (replaceScope === "school") {
      return (
        "This will DELETE all weekly lesson templates for the entire school, then create new templates from the preview.\n\n" +
        "Type OK to confirm."
      );
    }
    if (replaceScope === "affected_classes") {
      return (
        "This will DELETE existing weekly templates for every class that appears in your requirement rows, then create new ones.\n\n" +
        "Continue?"
      );
    }
    return "Create weekly lesson templates from this preview? Existing templates (unless replaced by scope above) are kept.";
  };

  const runCommit = async () => {
    const body = buildBody();
    if (!body) return;
    const preview = activePreview;
    if (!preview || preview.preview.unplaced.length > 0 || preview.policyErrors.length > 0) {
      toast.error("Run a successful preview with no unplaced slots and no policy errors first.");
      return;
    }
    const msg = confirmCommitMessage();
    if (replaceScope === "school") {
      const typed = window.prompt(msg);
      if (typed !== "OK") return;
    } else if (!window.confirm(msg)) {
      return;
    }

    setCommitting(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/timetable-assistant/commit-school`, {
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

  const toggleClassPick = (id: number) => {
    setPickedClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const classIdsForFilter = useMemo(() => {
    if (!activePreview) return [] as string[];
    const s = new Set([
      ...Object.keys(activePreview.summary.placedByClass),
      ...Object.keys(activePreview.summary.unplacedByClass),
    ]);
    return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [activePreview]);

  const filteredProposals = useMemo(() => {
    if (!activePreview) return [];
    return activePreview.preview.proposals.filter((p) => {
      if (filterClassId && String(p.classId) !== filterClassId) return false;
      if (filterTeacherId && p.teacherId !== filterTeacherId) return false;
      return true;
    });
  }, [activePreview, filterClassId, filterTeacherId]);

  const slotSummary = useMemo(() => {
    if (!activePreview) return null;
    const s = activePreview.summary;
    return `${s.totalProposals} placed · ${s.totalUnplaced} unplaced · ${s.scopeClassCount} class(es) in scope · ${s.totalRequiredSlots} required slots · ${s.totalAvailableSlotsPerClassWeek} max slots per class/week`;
  }, [activePreview]);

  if (!hasBellPeriods) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Whole-school timetable draft</h1>
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
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div>
        <p className="text-sm text-gray-600 mb-2">
          <Link href={`/schools/${schoolId}/admin/timetable-assistant`} className="text-indigo-700 underline font-medium">
            ← Single-class assistant
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Whole-school timetable draft</h1>
        <p className="text-sm text-gray-600 mt-1">
          Draft weekly <span className="font-medium">lesson templates</span> for multiple classes with shared teacher/room
          occupancy. Default <span className="font-medium">Preview (greedy)</span> is deterministic (class order, then
          requirement order).
          {optimizerEnabled && (
            <>
              {" "}
              <span className="font-medium">Preview (CP-SAT)</span> uses the same hard rules plus soft goals (see{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">docs/timetable/TIMETABLE_SOLVER_F3_IMPLEMENTATION.md</code>
              ).
            </>
          )}{" "}
          See <code className="text-xs bg-gray-100 px-1 rounded">docs/timetable/TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md</code>.
        </p>
      </div>

      <div className="space-y-3 border rounded-md p-4 bg-white">
        <div className="text-sm font-medium text-gray-800">Scope</div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scopeMode === "school"}
              onChange={() => setScopeMode("school")}
            />
            Whole school
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scopeMode === "grade"}
              onChange={() => setScopeMode("grade")}
            />
            One grade
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scopeMode === "classIds"}
              onChange={() => setScopeMode("classIds")}
            />
            Selected classes
          </label>
        </div>

        {scopeMode === "grade" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
            <select
              className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
            >
              <option value="">Select grade…</option>
              {grades.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.level}
                </option>
              ))}
            </select>
          </div>
        )}

        {scopeMode === "classIds" && (
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Classes in scope</div>
            <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1 text-sm">
              {classes.length === 0 ? (
                <p className="text-gray-500">No classes</p>
              ) : (
                classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pickedClassIds.includes(c.id)}
                      onChange={() => toggleClassPick(c.id)}
                    />
                    {c.label}
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        {scopeMode !== "classIds" && scopeMode !== "school" && classesInScope.length === 0 && gradeId && (
          <p className="text-sm text-amber-800">No classes for this grade.</p>
        )}
      </div>

      <div className="space-y-3 border rounded-md p-4 bg-white">
        <div className="text-sm font-medium text-gray-800">Entry mode</div>
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="entryMode"
              checked={uiMode === "table"}
              onChange={() => {
                if (uiMode === "matrix") switchToTable();
              }}
            />
            Table
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="entryMode"
              checked={uiMode === "matrix"}
              onChange={() => {
                if (uiMode === "table") switchToMatrix();
              }}
            />
            Matrix
          </label>
        </div>
        <p className="text-xs text-gray-600 max-w-3xl">
          Matrix view uses a class × subject grid with a default teacher per subject column. Block size and optional room
          below apply to all non-zero cells. Online lessons with meeting links are configured per row in{" "}
          <strong>Table</strong> mode only (matrix defaults to in-person). On narrow screens, scroll horizontally.
        </p>
      </div>

      <div className="space-y-3 border rounded-md p-4 bg-white">
        <div className="text-sm font-medium text-gray-800">Per-grade templates</div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Grade</label>
            <select
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm min-w-[10rem]"
              value={templateGradeId}
              onChange={(e) => setTemplateGradeId(e.target.value)}
            >
              <option value="">Select grade…</option>
              {grades.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.level}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void loadGradeTemplate()}
            className="px-3 py-1.5 rounded-md border border-gray-300 text-sm bg-white hover:bg-gray-50"
          >
            Load template
          </button>
          <button
            type="button"
            onClick={() => void saveGradeTemplate()}
            className="px-3 py-1.5 rounded-md border border-indigo-200 text-sm bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
          >
            Save template
          </button>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Apply mode</label>
            <select
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              value={templateApplyMode}
              onChange={(e) => setTemplateApplyMode(e.target.value as "replace" | "merge")}
            >
              <option value="replace">Replace current requirements</option>
              <option value="merge">Merge (template wins on conflicts)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void applyGradeTemplateFromServer()}
            className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-sm font-medium"
          >
            Apply template to classes in scope
          </button>
        </div>
        <p className="text-xs text-gray-600">
          Save stores the first class row in the matrix as the grade prototype (subject lines only). Load applies to all
          classes currently in scope.
        </p>
      </div>

      {uiMode === "matrix" && matrixState && (
        <div className="space-y-3">
          <div className="text-sm font-medium">Matrix defaults</div>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Block size (all cells)</label>
              <select
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={String(matrixState.globalBlockSize)}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  setMatrixState((prev) =>
                    prev ? { ...prev, globalBlockSize: Number.isNaN(n) ? 1 : n } : prev
                  );
                }}
              >
                {Array.from({ length: TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Room (all cells, optional)</label>
              <select
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm min-w-[8rem]"
                value={matrixState.globalRoomId == null ? "" : String(matrixState.globalRoomId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setMatrixState((prev) =>
                    prev
                      ? {
                          ...prev,
                          globalRoomId: v === "" ? null : Number.parseInt(v, 10),
                        }
                      : prev
                  );
                }}
              >
                <option value="">Any</option>
                {rooms.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Subject columns</div>
            <div className="max-h-32 overflow-y-auto border rounded-md p-2 flex flex-wrap gap-2 text-sm">
              {subjects.map((s) => {
                const checked =
                  subjectColumnFilter.length === 0 || subjectColumnFilter.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSubjectColumnFilter((prev) => {
                          const all = subjects.map((x) => x.id);
                          if (prev.length === 0) {
                            const next = all.filter((id) => id !== s.id);
                            return next;
                          }
                          if (prev.includes(s.id)) return prev.filter((id) => id !== s.id);
                          return [...prev, s.id];
                        });
                      }}
                    />
                    {s.name}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              When none are unchecked, all subjects are shown. Uncheck to hide columns (width).
            </p>
          </div>

          <div className="overflow-x-auto border rounded-md">
            <table className="min-w-max text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="sticky left-0 z-10 bg-gray-50 border-b border-r p-2 text-left min-w-[10rem]">
                    Class
                  </th>
                  {matrixSubjectIds.map((sid) => {
                    const sub = subjects.find((x) => x.id === sid);
                    const eligible = teachersBySubject(sid);
                    const colTeacher = matrixState.columnTeacherBySubject[sid] ?? "";
                    return (
                      <th key={sid} className="border-b p-2 text-left min-w-[11rem] align-bottom">
                        <div className="font-medium mb-1">{sub?.name ?? sid}</div>
                        <div className="text-xs text-gray-600 mb-1">Default teacher</div>
                        <select
                          className="w-full rounded border border-gray-200 px-1 py-0.5 text-xs"
                          value={colTeacher}
                          onChange={(e) => {
                            const v = e.target.value;
                            setMatrixState((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                columnTeacherBySubject: { ...prev.columnTeacherBySubject, [sid]: v },
                              };
                            });
                          }}
                        >
                          <option value="">—</option>
                          {eligible.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} {t.surname}
                            </option>
                          ))}
                        </select>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {classesInScope.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="sticky left-0 z-10 bg-white border-r p-2 font-medium text-gray-800">{c.label}</td>
                    {matrixSubjectIds.map((sid) => {
                      const k = cellKey(c.id, sid);
                      const cell = matrixState.cells[k] ?? { periodsPerWeek: 0, teacherIdOverride: null };
                      const col = matrixState.columnTeacherBySubject[sid] ?? "";
                      const effectiveTeacher = cell.teacherIdOverride ?? col;
                      return (
                        <td key={sid} className="border-l p-1 align-top min-w-[7rem]">
                          <input
                            type="number"
                            min={0}
                            max={40}
                            className="w-14 rounded border border-gray-200 px-1 py-0.5 mb-1"
                            value={cell.periodsPerWeek === 0 ? "" : cell.periodsPerWeek}
                            placeholder="0"
                            onChange={(e) => {
                              const raw = e.target.value;
                              const n = raw === "" ? 0 : Number.parseInt(raw, 10);
                              setMatrixState((prev) => {
                                if (!prev) return prev;
                                const cur = prev.cells[k] ?? { periodsPerWeek: 0, teacherIdOverride: null };
                                const pp = Number.isNaN(n) ? 0 : Math.max(0, Math.min(40, n));
                                return {
                                  ...prev,
                                  cells: {
                                    ...prev.cells,
                                    [k]: { ...cur, periodsPerWeek: pp },
                                  },
                                };
                              });
                            }}
                          />
                          <div className="text-[0.65rem] text-gray-500 mb-0.5">Override teacher</div>
                          <select
                            className="w-full rounded border border-gray-100 px-0.5 py-0.5 text-[0.7rem]"
                            value={cell.teacherIdOverride ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMatrixState((prev) => {
                                if (!prev) return prev;
                                const cur = prev.cells[k] ?? { periodsPerWeek: 0, teacherIdOverride: null };
                                const teacherIdOverride =
                                  v === "" || v === (prev.columnTeacherBySubject[sid] ?? "") ? null : v;
                                return {
                                  ...prev,
                                  cells: {
                                    ...prev.cells,
                                    [k]: {
                                      ...cur,
                                      teacherIdOverride,
                                    },
                                  },
                                };
                              });
                            }}
                          >
                            <option value="">(column default)</option>
                            {teachersBySubject(sid).map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} {t.surname}
                              </option>
                            ))}
                          </select>
                          {cell.periodsPerWeek > 0 && effectiveTeacher === "" && (
                            <p className="text-[0.65rem] text-red-600 mt-0.5">Set teacher</p>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {uiMode === "matrix"
              ? "Table mode is hidden — switch to Table to edit rows."
              : "Requirements (class · subject · teacher · periods/week · block · optional room)"}
          </span>
          {uiMode === "table" && (
            <button type="button" onClick={addRow} className="text-sm text-indigo-700 underline">
              Add row
            </button>
          )}
        </div>
        {uiMode === "table" && (
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Class</th>
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
                const classOptions = classesInScope.length > 0 ? classesInScope : classes;
                const isOnline = row.deliveryMode === LessonDeliveryMode.ONLINE;
                return (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <select
                        className="w-full min-w-[10rem] rounded border border-gray-200 px-2 py-1"
                        value={row.classId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, classId: v } : r)));
                        }}
                      >
                        <option value="">Class…</option>
                        {classOptions.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
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
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Replace existing templates (commit)</label>
        <select
          className="w-full max-w-lg rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={replaceScope}
          onChange={(e) =>
            setReplaceScope(e.target.value as TimetableAssistantSchoolBody["replaceScope"])
          }
        >
          <option value="none">None — only add new templates (may duplicate if a slot is already taken)</option>
          <option value="affected_classes">
            Affected classes — delete templates for classes listed in requirements, then insert
          </option>
          <option value="school">Entire school — delete ALL lesson templates for this school, then insert</option>
        </select>
        {replaceScope === "school" && (
          <p className="text-sm text-red-800 bg-red-50 border border-red-100 rounded p-2">
            <strong>Destructive:</strong> commit removes every weekly lesson template in the school before inserting the
            preview. Use preview carefully and confirm with the prompt.
          </p>
        )}
      </div>

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
          Commit applies the <span className="font-medium">selected</span> preview (Greedy vs CP-SAT tab). CP-SAT may take
          up to ~30s.
        </p>
      )}
      {!optimizerEnabled && (
        <p className="text-xs text-gray-700 max-w-3xl bg-gray-50 border border-gray-200 rounded-md p-3">
          <span className="font-medium text-gray-900">CP-SAT solver not shown</span> — Set{" "}
          <code className="text-[0.7rem] bg-white px-1 rounded border">TIMETABLE_SOLVER_ENABLED=1</code> and solver
          env vars in <code className="text-[0.7rem] bg-white px-1 rounded border">.env</code>, run{" "}
          <code className="text-[0.7rem] bg-white px-1 rounded border">services/timetable-solver/</code>, restart Next.js.
          Then <strong>Preview (CP-SAT)</strong> appears here.
        </p>
      )}

      {activePreview && (
        <div className="space-y-3 border rounded-md p-4 bg-gray-50">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Preview</h2>
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

          {activePreview.summary.totalUnplaced > 0 && (
            <div className="text-sm text-gray-700">
              <span className="font-medium">By class (unplaced):</span>{" "}
              {Object.entries(activePreview.summary.unplacedByClass)
                .map(([id, n]) => `${activePreview.classNameById[id] ?? id}: ${n}`)
                .join(" · ") || "—"}
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
              <p>Reduce load, widen scope, or fix conflicts, then preview again.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-end text-sm">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Filter class</label>
              <select
                className="rounded border border-gray-300 px-2 py-1"
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
              >
                <option value="">All</option>
                {classIdsForFilter.map((id) => (
                  <option key={id} value={id}>
                    {activePreview.classNameById[id] ?? id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Filter teacher</label>
              <select
                className="rounded border border-gray-300 px-2 py-1 min-w-[8rem]"
                value={filterTeacherId}
                onChange={(e) => setFilterTeacherId(e.target.value)}
              >
                <option value="">All</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.surname}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs text-gray-500 pb-1">
              Showing {filteredProposals.length} of {activePreview.preview.proposals.length} rows
            </span>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-1">Class</th>
                  <th className="p-1">Day</th>
                  <th className="p-1">Period</th>
                  <th className="p-1">Lesson</th>
                  <th className="p-1">Start</th>
                  <th className="p-1">End</th>
                </tr>
              </thead>
              <tbody>
                {filteredProposals.map((p, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="p-1">{activePreview.classNameById[String(p.classId)] ?? p.classId}</td>
                    <td className="p-1">{p.day}</td>
                    <td className="p-1">{p.periodName}</td>
                    <td className="p-1">{p.name}</td>
                    <td className="p-1">
                      {new Date(p.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="p-1">
                      {new Date(p.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
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

export default TimetableAssistantSchoolClient;
