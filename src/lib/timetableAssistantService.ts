import { Day, LessonDeliveryMode } from "@prisma/client";
import prisma from "@/lib/prisma";
import { teacherWhereByIdInSchool } from "@/lib/schoolAccess";
import { assertSetupStepReadyOrThrow } from "@/lib/domain/temporalRules";
import {
  BellPeriodError,
  type PeriodTimeSlice,
  validateLessonTimesAgainstBellPolicy,
} from "@/lib/domain/bellPeriodRules";
import {
  computeTimetablePreview,
  computeTimetablePreviewSchool,
  type ExistingSlot,
  type SchoolRequirementRow,
  type TimetablePreviewResult,
  type TimetableProposal,
  type TimetableRequirementRow,
} from "@/lib/domain/timetableAssistant";
import {
  findFirstOverlappingLessonForTeacher,
  loadForeignSchoolLessonsAsExistingSlots,
} from "@/lib/domain/lessonTeacherOverlap";
import { generateTermLessons } from "@/lib/domain/termLessonGenerationRules";
import { isSchedulingPipelineCommitEnabled } from "@/lib/schedulingFeatureFlags";
import type { TimetableAssistantBody, TimetableAssistantSchoolBody } from "@/lib/formValidationSchemas";
import {
  lessonOverlapsTeacherUnavailableRows,
  type TeacherUnavailableRow,
} from "@/lib/domain/timetableTeacherAvailability";
import {
  partitionSchoolForSolver,
  partitionSingleClassForSolver,
} from "@/lib/domain/timetableFeasibility";
import {
  runCpSatFeasibilityPlacement,
  runCpSatOptimizePlacement,
  TIMETABLE_SOLVER_MAX_TASKS,
} from "@/lib/domain/timetableSolverFeasibility";

function normalizeAssistantRequirementBase(r: {
  subjectId: number;
  teacherId: string;
  periodsPerWeek: number;
  blockSize?: number;
  roomId?: number | null;
  deliveryMode?: LessonDeliveryMode;
  meetingUrl?: string | null;
  meetingLabel?: string | null;
}): TimetableRequirementRow {
  const mode = r.deliveryMode ?? LessonDeliveryMode.IN_PERSON;
  const online = mode === LessonDeliveryMode.ONLINE;
  return {
    subjectId: r.subjectId,
    teacherId: r.teacherId,
    periodsPerWeek: r.periodsPerWeek,
    blockSize: r.blockSize,
    roomId: online ? null : r.roomId ?? null,
    deliveryMode: mode,
    meetingUrl: online ? r.meetingUrl ?? null : null,
    meetingLabel: online ? r.meetingLabel ?? null : null,
  };
}

function normalizeSchoolRequirementFromBody(
  r: TimetableAssistantSchoolBody["requirements"][number]
): SchoolRequirementRow {
  return {
    classId: r.classId,
    ...normalizeAssistantRequirementBase(r),
  };
}

function validateTimetableProposalBellPolicy(
  pr: Pick<TimetableProposal, "startTime" | "endTime" | "periodId" | "endPeriodId">,
  activePeriodSlices: PeriodTimeSlice[]
): void {
  const endId = pr.endPeriodId;
  if (endId != null && endId !== pr.periodId) {
    const startPeriod = activePeriodSlices.find((p) => p.id === pr.periodId);
    const endPeriod = activePeriodSlices.find((p) => p.id === endId);
    if (!startPeriod || !endPeriod) {
      throw new BellPeriodError("INVALID_SPAN", "Period span not found in active bell schedule.");
    }
    validateLessonTimesAgainstBellPolicy(pr.startTime, pr.endTime, activePeriodSlices, {
      periodSpan: { startPeriod, endPeriod },
    });
  } else {
    validateLessonTimesAgainstBellPolicy(pr.startTime, pr.endTime, activePeriodSlices);
  }
}

function mapLessonsToExistingSlots(
  rows: Array<{
    id: number;
    day: Day;
    startTime: Date;
    endTime: Date;
    teacherId: string;
    classId: number;
    roomId: number | null;
  }>
): ExistingSlot[] {
  return rows.map((l) => ({
    id: l.id,
    day: l.day,
    startTime: l.startTime,
    endTime: l.endTime,
    teacherId: l.teacherId,
    classId: l.classId,
    roomId: l.roomId,
  }));
}

async function mergeLocalAndForeignExistingSlots(params: {
  schoolId: string;
  teacherIds: string[];
  localLessons: Parameters<typeof mapLessonsToExistingSlots>[0];
}): Promise<ExistingSlot[]> {
  const [local, foreign] = await Promise.all([
    Promise.resolve(mapLessonsToExistingSlots(params.localLessons)),
    loadForeignSchoolLessonsAsExistingSlots({
      schoolId: params.schoolId,
      teacherIds: params.teacherIds,
    }),
  ]);
  return [...local, ...foreign];
}

async function assertTeacherTeachesSubject(schoolId: string, teacherId: string, subjectId: number) {
  const ok = await prisma.teacher.findFirst({
    where: {
      AND: [
        teacherWhereByIdInSchool(teacherId, schoolId),
        { subjects: { some: { id: subjectId, schoolId } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(ok);
}

async function loadTeacherUnavailableMapByTeacherId(params: {
  schoolId: string;
  teacherIds: string[];
}): Promise<Map<string, TeacherUnavailableRow[]>> {
  const { schoolId, teacherIds } = params;
  const unique = Array.from(new Set(teacherIds));
  if (unique.length === 0) return new Map();
  const rows = await prisma.teacherAvailability.findMany({
    where: {
      schoolId,
      teacherId: { in: unique },
      isAvailable: false,
    },
    select: { teacherId: true, dayOfWeek: true, startTime: true, endTime: true },
  });
  const map = new Map<string, TeacherUnavailableRow[]>();
  for (const r of rows) {
    const list = map.get(r.teacherId) ?? [];
    list.push({
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
    });
    map.set(r.teacherId, list);
  }
  return map;
}

/** Returns error message if unavailable blocks this slot. */
async function teacherUnavailableMessage(params: {
  schoolId: string;
  teacherId: string;
  lessonDay: Day;
  lessonStart: Date;
  lessonEnd: Date;
}): Promise<string | null> {
  const { schoolId, teacherId, lessonDay, lessonStart, lessonEnd } = params;
  const unavailableSlots = await prisma.teacherAvailability.findMany({
    where: {
      teacherId,
      schoolId,
      dayOfWeek: lessonDay,
      isAvailable: false,
    },
    select: { dayOfWeek: true, startTime: true, endTime: true },
  });
  const rows: TeacherUnavailableRow[] = unavailableSlots.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
  }));
  if (lessonOverlapsTeacherUnavailableRows(lessonDay, lessonStart, lessonEnd, rows)) {
    return "Lesson time conflicts with a period the teacher has marked as UNAVAILABLE.";
  }
  return null;
}

export type TimetableAssistantPreviewPayload = {
  preview: TimetablePreviewResult;
  className: string;
  periods: Array<{ id: string; name: string; order: number }>;
  policyErrors: string[];
};

export async function runTimetableAssistantPreview(params: {
  schoolId: string;
  body: TimetableAssistantBody;
}): Promise<
  { ok: true; data: TimetableAssistantPreviewPayload } | { ok: false; error: string; code: string }
> {
  const { schoolId, body } = params;
  try {
    await assertSetupStepReadyOrThrow(schoolId, "temporalInitialization");
  } catch (e) {
    return { ok: false, code: "SETUP_NOT_READY", error: e instanceof Error ? e.message : "Setup not ready." };
  }

  const cls = await prisma.class.findFirst({
    where: { id: body.classId, schoolId },
    select: { id: true, name: true },
  });
  if (!cls) {
    return { ok: false, code: "CLASS_NOT_FOUND", error: "Class not found in this school." };
  }

  const periodRows = await prisma.period.findMany({
    where: { schoolId, isArchived: false },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  if (periodRows.length === 0) {
    return {
      ok: false,
      code: "NO_PERIODS",
      error: "Add an active bell schedule before using the timetable assistant.",
    };
  }

  const periods = periodRows.map((p) => ({
    id: p.id,
    name: p.name,
    order: p.order,
    startTime: new Date(p.startTime),
    endTime: new Date(p.endTime),
  }));

  const activePeriodSlices: PeriodTimeSlice[] = periodRows.map((p) => ({
    id: p.id,
    name: p.name,
    startTime: new Date(p.startTime),
    endTime: new Date(p.endTime),
  }));

  const requirements: TimetableRequirementRow[] = body.requirements.map((r) =>
    normalizeAssistantRequirementBase(r)
  );

  const requirementErrors: string[] = [];
  for (let i = 0; i < requirements.length; i++) {
    const r = requirements[i];
    const teaches = await assertTeacherTeachesSubject(schoolId, r.teacherId, r.subjectId);
    if (!teaches) {
      requirementErrors.push(
        `Row ${i + 1}: teacher does not teach the selected subject (or invalid teacher/subject).`
      );
    }
  }
  if (requirementErrors.length > 0) {
    return {
      ok: false,
      code: "REQUIREMENT_INVALID",
      error: requirementErrors.join(" "),
    };
  }

  const allLessons = await prisma.lesson.findMany({
    where: { schoolId },
    select: {
      id: true,
      day: true,
      startTime: true,
      endTime: true,
      teacherId: true,
      classId: true,
      roomId: true,
    },
  });

  let existingFiltered = allLessons;
  if (body.replaceExistingClassLessons) {
    existingFiltered = allLessons.filter((l) => l.classId !== body.classId);
  }

  const subjectIds = Array.from(new Set(requirements.map((r) => r.subjectId)));
  const subjects = await prisma.subject.findMany({
    where: { schoolId, id: { in: subjectIds } },
    select: { id: true, name: true },
  });
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const teacherUnavailableByTeacherId = await loadTeacherUnavailableMapByTeacherId({
    schoolId,
    teacherIds: requirements.map((r) => r.teacherId),
  });

  const existingSlots = await mergeLocalAndForeignExistingSlots({
    schoolId,
    teacherIds: requirements.map((r) => r.teacherId),
    localLessons: existingFiltered,
  });

  const preview = computeTimetablePreview({
    periods,
    requirements,
    classId: body.classId,
    subjectNameById,
    className: cls.name,
    existing: existingSlots,
    teacherUnavailableByTeacherId,
  });

  const policyErrors: string[] = [];
  for (let i = 0; i < preview.proposals.length; i++) {
    const pr = preview.proposals[i];
    try {
      validateTimetableProposalBellPolicy(pr, activePeriodSlices);
    } catch (e) {
      if (e instanceof BellPeriodError) {
        policyErrors.push(`Proposal ${i + 1}: ${e.message}`);
      } else {
        policyErrors.push(`Proposal ${i + 1}: validation failed.`);
      }
    }
  }

  return {
    ok: true,
    data: {
      preview,
      className: cls.name,
      periods: periods.map((p) => ({ id: p.id, name: p.name, order: p.order })),
      policyErrors,
    },
  };
}

function isTimetableOptimizeEnabled(): boolean {
  return process.env.TIMETABLE_SOLVER_ENABLED === "1";
}

function getTimetableSolverConnection(): { url: string; secret: string } | null {
  const url = process.env.TIMETABLE_SOLVER_URL?.trim();
  const secret = process.env.TIMETABLE_SOLVER_SECRET?.trim();
  if (!url || !secret) return null;
  return { url, secret };
}

/** When set, preview-optimize uses feasibility-only solver (debug / regression). */
function isTimetableSolverFeasibilityOnly(): boolean {
  return process.env.TIMETABLE_SOLVER_FEASIBILITY_ONLY === "1";
}

/** CP-SAT feasibility preview (single class). Requires env + Python solver. */
export async function runTimetableAssistantPreviewOptimize(params: {
  schoolId: string;
  body: TimetableAssistantBody;
}): Promise<
  { ok: true; data: TimetableAssistantPreviewPayload } | { ok: false; error: string; code: string }
> {
  if (!isTimetableOptimizeEnabled()) {
    return {
      ok: false,
      code: "SOLVER_DISABLED",
      error: "Timetable optimizer is disabled (set TIMETABLE_SOLVER_ENABLED=1).",
    };
  }
  const conn = getTimetableSolverConnection();
  if (!conn) {
    return {
      ok: false,
      code: "SOLVER_UNAVAILABLE",
      error: "Configure TIMETABLE_SOLVER_URL and TIMETABLE_SOLVER_SECRET for the solver service.",
    };
  }

  const { schoolId, body } = params;
  try {
    await assertSetupStepReadyOrThrow(schoolId, "temporalInitialization");
  } catch (e) {
    return { ok: false, code: "SETUP_NOT_READY", error: e instanceof Error ? e.message : "Setup not ready." };
  }

  const cls = await prisma.class.findFirst({
    where: { id: body.classId, schoolId },
    select: { id: true, name: true },
  });
  if (!cls) {
    return { ok: false, code: "CLASS_NOT_FOUND", error: "Class not found in this school." };
  }

  const periodRows = await prisma.period.findMany({
    where: { schoolId, isArchived: false },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  if (periodRows.length === 0) {
    return {
      ok: false,
      code: "NO_PERIODS",
      error: "Add an active bell schedule before using the timetable assistant.",
    };
  }

  const periods = periodRows.map((p) => ({
    id: p.id,
    name: p.name,
    order: p.order,
    startTime: new Date(p.startTime),
    endTime: new Date(p.endTime),
  }));

  const activePeriodSlices: PeriodTimeSlice[] = periodRows.map((p) => ({
    id: p.id,
    name: p.name,
    startTime: new Date(p.startTime),
    endTime: new Date(p.endTime),
  }));

  const requirements: TimetableRequirementRow[] = body.requirements.map((r) =>
    normalizeAssistantRequirementBase(r)
  );

  const requirementErrors: string[] = [];
  for (let i = 0; i < requirements.length; i++) {
    const r = requirements[i];
    const teaches = await assertTeacherTeachesSubject(schoolId, r.teacherId, r.subjectId);
    if (!teaches) {
      requirementErrors.push(
        `Row ${i + 1}: teacher does not teach the selected subject (or invalid teacher/subject).`
      );
    }
  }
  if (requirementErrors.length > 0) {
    return {
      ok: false,
      code: "REQUIREMENT_INVALID",
      error: requirementErrors.join(" "),
    };
  }

  const allLessons = await prisma.lesson.findMany({
    where: { schoolId },
    select: {
      id: true,
      day: true,
      startTime: true,
      endTime: true,
      teacherId: true,
      classId: true,
      roomId: true,
    },
  });

  let existingFiltered = allLessons;
  if (body.replaceExistingClassLessons) {
    existingFiltered = allLessons.filter((l) => l.classId !== body.classId);
  }

  const subjectIds = Array.from(new Set(requirements.map((r) => r.subjectId)));
  const subjects = await prisma.subject.findMany({
    where: { schoolId, id: { in: subjectIds } },
    select: { id: true, name: true },
  });
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const teacherUnavailableByTeacherId = await loadTeacherUnavailableMapByTeacherId({
    schoolId,
    teacherIds: requirements.map((r) => r.teacherId),
  });

  const existingSlots = await mergeLocalAndForeignExistingSlots({
    schoolId,
    teacherIds: requirements.map((r) => r.teacherId),
    localLessons: existingFiltered,
  });

  const part = partitionSingleClassForSolver({
    periods,
    requirements,
    classId: body.classId,
  });

  if (part.validTasks.length === 0) {
    const preview: TimetablePreviewResult = {
      proposals: [],
      unplaced: part.capacityUnplaced,
      totalRequiredSlots: part.totalRequiredSlots,
      totalAvailableSlots: part.totalAvailableSlots,
    };
    return {
      ok: true,
      data: {
        preview,
        className: cls.name,
        periods: periods.map((p) => ({ id: p.id, name: p.name, order: p.order })),
        policyErrors: [],
      },
    };
  }

  if (part.validTasks.length > TIMETABLE_SOLVER_MAX_TASKS) {
    return {
      ok: false,
      code: "SOLVER_TOO_LARGE",
      error: `At most ${TIMETABLE_SOLVER_MAX_TASKS} placement tasks for the optimizer.`,
    };
  }

  const classNameById = new Map<number, string>([[body.classId, cls.name]]);

  const solverArgs = {
    tasks: part.validTasks,
    sortedPeriods: part.sortedPeriods,
    existing: existingSlots,
    teacherUnavailableByTeacherId,
    subjectNameById,
    classNameById,
    solverBaseUrl: conn.url,
    solverSecret: conn.secret,
  } as const;
  const solved = isTimetableSolverFeasibilityOnly()
    ? await runCpSatFeasibilityPlacement(solverArgs)
    : await runCpSatOptimizePlacement(solverArgs);

  if (!solved.ok) {
    const err =
      solved.code === "INFEASIBLE"
        ? "No feasible weekly placement exists for these requirements under hard constraints."
        : solved.error ?? "Optimizer failed.";
    return { ok: false, code: solved.code, error: err };
  }

  const preview: TimetablePreviewResult = {
    proposals: solved.proposals,
    unplaced: part.capacityUnplaced,
    totalRequiredSlots: part.totalRequiredSlots,
    totalAvailableSlots: part.totalAvailableSlots,
  };

  const policyErrors: string[] = [];
  for (let i = 0; i < preview.proposals.length; i++) {
    const pr = preview.proposals[i];
    try {
      validateTimetableProposalBellPolicy(pr, activePeriodSlices);
    } catch (e) {
      if (e instanceof BellPeriodError) {
        policyErrors.push(`Proposal ${i + 1}: ${e.message}`);
      } else {
        policyErrors.push(`Proposal ${i + 1}: validation failed.`);
      }
    }
  }

  return {
    ok: true,
    data: {
      preview,
      className: cls.name,
      periods: periods.map((p) => ({ id: p.id, name: p.name, order: p.order })),
      policyErrors,
    },
  };
}

export async function runTimetableAssistantCommit(params: {
  schoolId: string;
  body: TimetableAssistantBody;
}): Promise<
  | { ok: true; createdCount: number; termSync: "ran" | "skipped_pipeline_disabled" | "failed_logged" }
  | { ok: false; error: string; code: string }
> {
  const previewResult = await runTimetableAssistantPreview(params);
  if (!previewResult.ok) return previewResult;

  const { preview, policyErrors } = previewResult.data;
  if (policyErrors.length > 0) {
    return { ok: false, code: "POLICY_INVALID", error: policyErrors.join(" ") };
  }
  if (preview.unplaced.length > 0) {
    return {
      ok: false,
      code: "UNPLACED",
      error: `Could not place ${preview.unplaced.length} lesson slot(s). Preview again or reduce periods per week.`,
    };
  }

  for (const pr of preview.proposals) {
    const msg = await teacherUnavailableMessage({
      schoolId: params.schoolId,
      teacherId: pr.teacherId,
      lessonDay: pr.day,
      lessonStart: pr.startTime,
      lessonEnd: pr.endTime,
    });
    if (msg) {
      return { ok: false, code: "TEACHER_UNAVAILABLE", error: msg };
    }
  }

  const { schoolId, body } = params;

  for (const pr of preview.proposals) {
    if (pr.roomId != null) {
      const roomOk = await prisma.room.findFirst({
        where: { id: pr.roomId, schoolId },
        select: { id: true },
      });
      if (!roomOk) {
        return { ok: false, code: "ROOM_NOT_FOUND", error: "One or more rooms are invalid for this school." };
      }
    }
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (body.replaceExistingClassLessons) {
        await tx.lesson.deleteMany({
          where: { schoolId, classId: body.classId },
        });
      }

      const rows: Awaited<ReturnType<typeof tx.lesson.create>>[] = [];
      for (const pr of preview.proposals) {
        const hit = await findFirstOverlappingLessonForTeacher(tx, {
          schoolId,
          teacherId: pr.teacherId,
          day: pr.day,
          lessonStartTime: pr.startTime,
          lessonEndTime: pr.endTime,
        });
        if (hit) {
          throw new Error(
            hit.schoolId !== schoolId
              ? "TEACHER_GLOBAL_CONFLICT: This teacher already has a lesson at this time in another school."
              : "TEACHER_SCHEDULING_CONFLICT: This teacher already has a lesson at this time."
          );
        }
        const row = await tx.lesson.create({
          data: {
            name: pr.name,
            day: pr.day,
            startTime: pr.startTime,
            endTime: pr.endTime,
            subjectId: pr.subjectId,
            classId: pr.classId,
            teacherId: pr.teacherId,
            roomId: pr.roomId,
            deliveryMode: pr.deliveryMode,
            meetingUrl: pr.meetingUrl,
            meetingLabel: pr.meetingLabel,
            schoolId,
            periodId: pr.periodId,
            endPeriodId: pr.endPeriodId,
          },
        });
        rows.push(row);
      }
      return rows;
    });

    let termSync: "ran" | "skipped_pipeline_disabled" | "failed_logged" = "ran";
    const pipeline = await isSchedulingPipelineCommitEnabled(schoolId);
    if (!pipeline) {
      termSync = "skipped_pipeline_disabled";
    } else {
      const now = new Date();
      const terms = await prisma.term.findMany({
        where: {
          schoolId,
          isArchived: false,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        select: { id: true },
      });
      try {
        for (const term of terms) {
          await generateTermLessons({
            schoolId,
            termId: term.id,
            mode: "commit",
            requestId: `tt-asst-${body.classId}-${term.id}`,
            idempotencyKey: `tt-asst-${body.classId}-${term.id}-${Date.now()}`,
            scope: { type: "class", classId: body.classId },
          });
        }
      } catch (e) {
        console.error("Timetable assistant: term session sync failed after commit", e);
        termSync = "failed_logged";
      }
    }

    return { ok: true, createdCount: created.length, termSync };
  } catch (e) {
    console.error("Timetable assistant commit", e);
    const msg = e instanceof Error ? e.message : "Commit failed.";
    if (msg.startsWith("TEACHER_GLOBAL_CONFLICT:")) {
      return { ok: false, code: "TEACHER_GLOBAL_CONFLICT", error: msg.replace(/^TEACHER_GLOBAL_CONFLICT:\s*/, "") };
    }
    if (msg.startsWith("TEACHER_SCHEDULING_CONFLICT:")) {
      return { ok: false, code: "TEACHER_SCHEDULING_CONFLICT", error: msg.replace(/^TEACHER_SCHEDULING_CONFLICT:\s*/, "") };
    }
    return {
      ok: false,
      code: "COMMIT_FAILED",
      error: msg,
    };
  }
}

async function resolveScopeToClasses(params: {
  schoolId: string;
  scope: TimetableAssistantSchoolBody["scope"];
}): Promise<
  | { ok: true; classOrder: number[]; classes: { id: number; name: string }[] }
  | { ok: false; code: string; error: string }
> {
  const { schoolId, scope } = params;
  const yearFilter = { academicYear: { isArchived: false } };

  if (scope.type === "school") {
    const rows = await prisma.class.findMany({
      where: { schoolId, ...yearFilter },
      select: { id: true, name: true, grade: { select: { level: true } } },
      orderBy: [{ grade: { level: "asc" } }, { name: "asc" }],
    });
    if (rows.length === 0) {
      return { ok: false, code: "NO_CLASSES", error: "No classes in an active academic year for this school." };
    }
    return {
      ok: true,
      classOrder: rows.map((r) => r.id),
      classes: rows.map((r) => ({ id: r.id, name: r.name })),
    };
  }

  if (scope.type === "grade") {
    const rows = await prisma.class.findMany({
      where: { schoolId, gradeId: scope.gradeId, ...yearFilter },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    if (rows.length === 0) {
      return { ok: false, code: "GRADE_EMPTY", error: "No classes found for this grade in the active academic year." };
    }
    return {
      ok: true,
      classOrder: rows.map((r) => r.id),
      classes: rows.map((r) => ({ id: r.id, name: r.name })),
    };
  }

  const rows = await prisma.class.findMany({
    where: { schoolId, id: { in: scope.ids }, ...yearFilter },
    select: { id: true, name: true, grade: { select: { level: true } } },
    orderBy: [{ grade: { level: "asc" } }, { name: "asc" }],
  });
  const found = new Set(rows.map((r) => r.id));
  for (const id of scope.ids) {
    if (!found.has(id)) {
      return {
        ok: false,
        code: "CLASS_SCOPE_INVALID",
        error: `Class ${id} is missing, not in this school, or in an archived academic year.`,
      };
    }
  }
  return {
    ok: true,
    classOrder: rows.map((r) => r.id),
    classes: rows.map((r) => ({ id: r.id, name: r.name })),
  };
}

type LessonRowForPreview = Parameters<typeof mapLessonsToExistingSlots>[0][number];

function filterExistingForSchoolPreview(params: {
  allLessons: LessonRowForPreview[];
  replaceScope: TimetableAssistantSchoolBody["replaceScope"];
  requirementClassIds: Set<number>;
}): LessonRowForPreview[] {
  const { allLessons, replaceScope, requirementClassIds } = params;
  if (replaceScope === "school") return [];
  if (replaceScope === "none") return allLessons;
  return allLessons.filter((l) => !requirementClassIds.has(l.classId));
}

function buildSchoolPlacementSummary(preview: TimetablePreviewResult) {
  const placedByClass: Record<string, number> = {};
  const unplacedByClass: Record<string, number> = {};
  for (const p of preview.proposals) {
    const k = String(p.classId);
    placedByClass[k] = (placedByClass[k] ?? 0) + 1;
  }
  for (const u of preview.unplaced) {
    const k = String(u.classId);
    unplacedByClass[k] = (unplacedByClass[k] ?? 0) + 1;
  }
  return {
    placedByClass,
    unplacedByClass,
    totalProposals: preview.proposals.length,
    totalUnplaced: preview.unplaced.length,
  };
}

export type TimetableAssistantSchoolPreviewPayload = {
  preview: TimetablePreviewResult;
  periods: Array<{ id: string; name: string; order: number }>;
  policyErrors: string[];
  summary: ReturnType<typeof buildSchoolPlacementSummary> & {
    scopeClassCount: number;
    totalRequiredSlots: number;
    totalAvailableSlotsPerClassWeek: number;
  };
  classNameById: Record<string, string>;
};

export async function runTimetableAssistantSchoolPreview(params: {
  schoolId: string;
  body: TimetableAssistantSchoolBody;
}): Promise<
  { ok: true; data: TimetableAssistantSchoolPreviewPayload } | { ok: false; error: string; code: string }
> {
  const { schoolId, body } = params;
  try {
    await assertSetupStepReadyOrThrow(schoolId, "temporalInitialization");
  } catch (e) {
    return { ok: false, code: "SETUP_NOT_READY", error: e instanceof Error ? e.message : "Setup not ready." };
  }

  const resolved = await resolveScopeToClasses({ schoolId, scope: body.scope });
  if (!resolved.ok) return resolved;

  const allowed = new Set(resolved.classOrder);
  const schoolRequirements: SchoolRequirementRow[] = [];
  for (const r of body.requirements) {
    if (!allowed.has(r.classId)) {
      return {
        ok: false,
        code: "REQUIREMENT_CLASS_OUT_OF_SCOPE",
        error: `Class ${r.classId} is not in the selected scope.`,
      };
    }
    schoolRequirements.push(normalizeSchoolRequirementFromBody(r));
  }

  const requirementErrors: string[] = [];
  for (let i = 0; i < schoolRequirements.length; i++) {
    const r = schoolRequirements[i];
    const teaches = await assertTeacherTeachesSubject(schoolId, r.teacherId, r.subjectId);
    if (!teaches) {
      requirementErrors.push(
        `Row ${i + 1}: teacher does not teach the selected subject (or invalid teacher/subject).`
      );
    }
  }
  if (requirementErrors.length > 0) {
    return { ok: false, code: "REQUIREMENT_INVALID", error: requirementErrors.join(" ") };
  }

  const periodRows = await prisma.period.findMany({
    where: { schoolId, isArchived: false },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  if (periodRows.length === 0) {
    return {
      ok: false,
      code: "NO_PERIODS",
      error: "Add an active bell schedule before using the timetable assistant.",
    };
  }

  const periods = periodRows.map((p) => ({
    id: p.id,
    name: p.name,
    order: p.order,
    startTime: new Date(p.startTime),
    endTime: new Date(p.endTime),
  }));

  const activePeriodSlices: PeriodTimeSlice[] = periodRows.map((p) => ({
    id: p.id,
    name: p.name,
    startTime: new Date(p.startTime),
    endTime: new Date(p.endTime),
  }));

  const subjectIds = Array.from(new Set(schoolRequirements.map((r) => r.subjectId)));
  const subjects = await prisma.subject.findMany({
    where: { schoolId, id: { in: subjectIds } },
    select: { id: true, name: true },
  });
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const classNameById = new Map(resolved.classes.map((c) => [c.id, c.name]));

  const allLessons = await prisma.lesson.findMany({
    where: { schoolId },
    select: {
      id: true,
      day: true,
      startTime: true,
      endTime: true,
      teacherId: true,
      classId: true,
      roomId: true,
    },
  });

  const requirementClassIds = new Set(schoolRequirements.map((r) => r.classId));
  const existingFiltered = filterExistingForSchoolPreview({
    allLessons,
    replaceScope: body.replaceScope ?? "none",
    requirementClassIds,
  });

  const teacherUnavailableByTeacherId = await loadTeacherUnavailableMapByTeacherId({
    schoolId,
    teacherIds: schoolRequirements.map((r) => r.teacherId),
  });

  const existingSchoolSlots = await mergeLocalAndForeignExistingSlots({
    schoolId,
    teacherIds: schoolRequirements.map((r) => r.teacherId),
    localLessons: existingFiltered,
  });

  const preview = computeTimetablePreviewSchool({
    periods,
    requirements: schoolRequirements,
    classOrder: resolved.classOrder,
    subjectNameById,
    classNameById,
    existing: existingSchoolSlots,
    teacherUnavailableByTeacherId,
  });

  const policyErrors: string[] = [];
  for (let i = 0; i < preview.proposals.length; i++) {
    const pr = preview.proposals[i];
    try {
      validateTimetableProposalBellPolicy(pr, activePeriodSlices);
    } catch (e) {
      if (e instanceof BellPeriodError) {
        policyErrors.push(`Proposal ${i + 1}: ${e.message}`);
      } else {
        policyErrors.push(`Proposal ${i + 1}: validation failed.`);
      }
    }
  }

  const summaryBase = buildSchoolPlacementSummary(preview);

  return {
    ok: true,
    data: {
      preview,
      periods: periods.map((p) => ({ id: p.id, name: p.name, order: p.order })),
      policyErrors,
      summary: {
        ...summaryBase,
        scopeClassCount: resolved.classOrder.length,
        totalRequiredSlots: preview.totalRequiredSlots,
        totalAvailableSlotsPerClassWeek: preview.totalAvailableSlots,
      },
      classNameById: Object.fromEntries(Array.from(classNameById.entries()).map(([k, v]) => [String(k), v])),
    },
  };
}

/** CP-SAT feasibility preview (school / multi-class). */
export async function runTimetableAssistantSchoolPreviewOptimize(params: {
  schoolId: string;
  body: TimetableAssistantSchoolBody;
}): Promise<
  { ok: true; data: TimetableAssistantSchoolPreviewPayload } | { ok: false; error: string; code: string }
> {
  if (!isTimetableOptimizeEnabled()) {
    return {
      ok: false,
      code: "SOLVER_DISABLED",
      error: "Timetable optimizer is disabled (set TIMETABLE_SOLVER_ENABLED=1).",
    };
  }
  const conn = getTimetableSolverConnection();
  if (!conn) {
    return {
      ok: false,
      code: "SOLVER_UNAVAILABLE",
      error: "Configure TIMETABLE_SOLVER_URL and TIMETABLE_SOLVER_SECRET for the solver service.",
    };
  }

  const { schoolId, body } = params;
  try {
    await assertSetupStepReadyOrThrow(schoolId, "temporalInitialization");
  } catch (e) {
    return { ok: false, code: "SETUP_NOT_READY", error: e instanceof Error ? e.message : "Setup not ready." };
  }

  const resolved = await resolveScopeToClasses({ schoolId, scope: body.scope });
  if (!resolved.ok) return resolved;

  const allowed = new Set(resolved.classOrder);
  const schoolRequirements: SchoolRequirementRow[] = [];
  for (const r of body.requirements) {
    if (!allowed.has(r.classId)) {
      return {
        ok: false,
        code: "REQUIREMENT_CLASS_OUT_OF_SCOPE",
        error: `Class ${r.classId} is not in the selected scope.`,
      };
    }
    schoolRequirements.push(normalizeSchoolRequirementFromBody(r));
  }

  const requirementErrors: string[] = [];
  for (let i = 0; i < schoolRequirements.length; i++) {
    const r = schoolRequirements[i];
    const teaches = await assertTeacherTeachesSubject(schoolId, r.teacherId, r.subjectId);
    if (!teaches) {
      requirementErrors.push(
        `Row ${i + 1}: teacher does not teach the selected subject (or invalid teacher/subject).`
      );
    }
  }
  if (requirementErrors.length > 0) {
    return { ok: false, code: "REQUIREMENT_INVALID", error: requirementErrors.join(" ") };
  }

  const periodRows = await prisma.period.findMany({
    where: { schoolId, isArchived: false },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  if (periodRows.length === 0) {
    return {
      ok: false,
      code: "NO_PERIODS",
      error: "Add an active bell schedule before using the timetable assistant.",
    };
  }

  const periods = periodRows.map((p) => ({
    id: p.id,
    name: p.name,
    order: p.order,
    startTime: new Date(p.startTime),
    endTime: new Date(p.endTime),
  }));

  const activePeriodSlices: PeriodTimeSlice[] = periodRows.map((p) => ({
    id: p.id,
    name: p.name,
    startTime: new Date(p.startTime),
    endTime: new Date(p.endTime),
  }));

  const subjectIds = Array.from(new Set(schoolRequirements.map((r) => r.subjectId)));
  const subjects = await prisma.subject.findMany({
    where: { schoolId, id: { in: subjectIds } },
    select: { id: true, name: true },
  });
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const classNameById = new Map(resolved.classes.map((c) => [c.id, c.name]));

  const allLessons = await prisma.lesson.findMany({
    where: { schoolId },
    select: {
      id: true,
      day: true,
      startTime: true,
      endTime: true,
      teacherId: true,
      classId: true,
      roomId: true,
    },
  });

  const requirementClassIds = new Set(schoolRequirements.map((r) => r.classId));
  const existingFiltered = filterExistingForSchoolPreview({
    allLessons,
    replaceScope: body.replaceScope ?? "none",
    requirementClassIds,
  });

  const teacherUnavailableByTeacherId = await loadTeacherUnavailableMapByTeacherId({
    schoolId,
    teacherIds: schoolRequirements.map((r) => r.teacherId),
  });

  const existingSchoolSlotsOpt = await mergeLocalAndForeignExistingSlots({
    schoolId,
    teacherIds: schoolRequirements.map((r) => r.teacherId),
    localLessons: existingFiltered,
  });

  const part = partitionSchoolForSolver({
    periods,
    requirements: schoolRequirements,
    classOrder: resolved.classOrder,
  });

  if (part.validTasks.length === 0) {
    const preview: TimetablePreviewResult = {
      proposals: [],
      unplaced: part.capacityUnplaced,
      totalRequiredSlots: part.totalRequiredSlots,
      totalAvailableSlots: part.totalAvailableSlots,
    };
    const summaryBase = buildSchoolPlacementSummary(preview);
    return {
      ok: true,
      data: {
        preview,
        periods: periods.map((p) => ({ id: p.id, name: p.name, order: p.order })),
        policyErrors: [],
        summary: {
          ...summaryBase,
          scopeClassCount: resolved.classOrder.length,
          totalRequiredSlots: preview.totalRequiredSlots,
          totalAvailableSlotsPerClassWeek: preview.totalAvailableSlots,
        },
        classNameById: Object.fromEntries(Array.from(classNameById.entries()).map(([k, v]) => [String(k), v])),
      },
    };
  }

  if (part.validTasks.length > TIMETABLE_SOLVER_MAX_TASKS) {
    return {
      ok: false,
      code: "SOLVER_TOO_LARGE",
      error: `At most ${TIMETABLE_SOLVER_MAX_TASKS} placement tasks for the optimizer.`,
    };
  }

  const schoolSolverArgs = {
    tasks: part.validTasks,
    sortedPeriods: part.sortedPeriods,
    existing: existingSchoolSlotsOpt,
    teacherUnavailableByTeacherId,
    subjectNameById,
    classNameById,
    solverBaseUrl: conn.url,
    solverSecret: conn.secret,
  } as const;
  const solved = isTimetableSolverFeasibilityOnly()
    ? await runCpSatFeasibilityPlacement(schoolSolverArgs)
    : await runCpSatOptimizePlacement(schoolSolverArgs);

  if (!solved.ok) {
    const err =
      solved.code === "INFEASIBLE"
        ? "No feasible weekly placement exists for these requirements under hard constraints."
        : solved.error ?? "Optimizer failed.";
    return { ok: false, code: solved.code, error: err };
  }

  const preview: TimetablePreviewResult = {
    proposals: solved.proposals,
    unplaced: part.capacityUnplaced,
    totalRequiredSlots: part.totalRequiredSlots,
    totalAvailableSlots: part.totalAvailableSlots,
  };

  const policyErrors: string[] = [];
  for (let i = 0; i < preview.proposals.length; i++) {
    const pr = preview.proposals[i];
    try {
      validateTimetableProposalBellPolicy(pr, activePeriodSlices);
    } catch (e) {
      if (e instanceof BellPeriodError) {
        policyErrors.push(`Proposal ${i + 1}: ${e.message}`);
      } else {
        policyErrors.push(`Proposal ${i + 1}: validation failed.`);
      }
    }
  }

  const summaryBase = buildSchoolPlacementSummary(preview);

  return {
    ok: true,
    data: {
      preview,
      periods: periods.map((p) => ({ id: p.id, name: p.name, order: p.order })),
      policyErrors,
      summary: {
        ...summaryBase,
        scopeClassCount: resolved.classOrder.length,
        totalRequiredSlots: preview.totalRequiredSlots,
        totalAvailableSlotsPerClassWeek: preview.totalAvailableSlots,
      },
      classNameById: Object.fromEntries(Array.from(classNameById.entries()).map(([k, v]) => [String(k), v])),
    },
  };
}

export async function runTimetableAssistantSchoolCommit(params: {
  schoolId: string;
  body: TimetableAssistantSchoolBody;
}): Promise<
  | {
      ok: true;
      createdCount: number;
      termSync: "ran" | "skipped_pipeline_disabled" | "failed_logged";
    }
  | { ok: false; error: string; code: string }
> {
  const previewResult = await runTimetableAssistantSchoolPreview(params);
  if (!previewResult.ok) return previewResult;

  const { preview, policyErrors } = previewResult.data;
  if (policyErrors.length > 0) {
    return { ok: false, code: "POLICY_INVALID", error: policyErrors.join(" ") };
  }
  if (preview.unplaced.length > 0) {
    return {
      ok: false,
      code: "UNPLACED",
      error: `Could not place ${preview.unplaced.length} lesson slot(s). Preview again or reduce load.`,
    };
  }

  const { schoolId, body } = params;

  for (const pr of preview.proposals) {
    const msg = await teacherUnavailableMessage({
      schoolId,
      teacherId: pr.teacherId,
      lessonDay: pr.day,
      lessonStart: pr.startTime,
      lessonEnd: pr.endTime,
    });
    if (msg) {
      return { ok: false, code: "TEACHER_UNAVAILABLE", error: msg };
    }
  }

  for (const pr of preview.proposals) {
    if (pr.roomId != null) {
      const roomOk = await prisma.room.findFirst({
        where: { id: pr.roomId, schoolId },
        select: { id: true },
      });
      if (!roomOk) {
        return { ok: false, code: "ROOM_NOT_FOUND", error: "One or more rooms are invalid for this school." };
      }
    }
  }

  const replaceScope = body.replaceScope ?? "none";
  const requirementClassIds = Array.from(new Set(body.requirements.map((r) => r.classId)));

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (replaceScope === "school") {
        await tx.lesson.deleteMany({ where: { schoolId } });
      } else if (replaceScope === "affected_classes") {
        await tx.lesson.deleteMany({
          where: { schoolId, classId: { in: requirementClassIds } },
        });
      }

      const rows: Awaited<ReturnType<typeof tx.lesson.create>>[] = [];
      for (const pr of preview.proposals) {
        const hit = await findFirstOverlappingLessonForTeacher(tx, {
          schoolId,
          teacherId: pr.teacherId,
          day: pr.day,
          lessonStartTime: pr.startTime,
          lessonEndTime: pr.endTime,
        });
        if (hit) {
          throw new Error(
            hit.schoolId !== schoolId
              ? "TEACHER_GLOBAL_CONFLICT: This teacher already has a lesson at this time in another school."
              : "TEACHER_SCHEDULING_CONFLICT: This teacher already has a lesson at this time."
          );
        }
        const row = await tx.lesson.create({
          data: {
            name: pr.name,
            day: pr.day,
            startTime: pr.startTime,
            endTime: pr.endTime,
            subjectId: pr.subjectId,
            classId: pr.classId,
            teacherId: pr.teacherId,
            roomId: pr.roomId,
            deliveryMode: pr.deliveryMode,
            meetingUrl: pr.meetingUrl,
            meetingLabel: pr.meetingLabel,
            schoolId,
            periodId: pr.periodId,
            endPeriodId: pr.endPeriodId,
          },
        });
        rows.push(row);
      }
      return rows;
    });

    let termSync: "ran" | "skipped_pipeline_disabled" | "failed_logged" = "ran";
    const pipeline = await isSchedulingPipelineCommitEnabled(schoolId);
    if (!pipeline) {
      termSync = "skipped_pipeline_disabled";
    } else {
      const now = new Date();
      const terms = await prisma.term.findMany({
        where: {
          schoolId,
          isArchived: false,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        select: { id: true },
      });
      try {
        for (const term of terms) {
          await generateTermLessons({
            schoolId,
            termId: term.id,
            mode: "commit",
            requestId: `tt-asst-school-${term.id}`,
            idempotencyKey: `tt-asst-school-${term.id}-${Date.now()}`,
            scope: { type: "school" },
          });
        }
      } catch (e) {
        console.error("Timetable assistant school: term session sync failed after commit", e);
        termSync = "failed_logged";
      }
    }

    return { ok: true, createdCount: created.length, termSync };
  } catch (e) {
    console.error("Timetable assistant school commit", e);
    const msg = e instanceof Error ? e.message : "Commit failed.";
    if (msg.startsWith("TEACHER_GLOBAL_CONFLICT:")) {
      return { ok: false, code: "TEACHER_GLOBAL_CONFLICT", error: msg.replace(/^TEACHER_GLOBAL_CONFLICT:\s*/, "") };
    }
    if (msg.startsWith("TEACHER_SCHEDULING_CONFLICT:")) {
      return { ok: false, code: "TEACHER_SCHEDULING_CONFLICT", error: msg.replace(/^TEACHER_SCHEDULING_CONFLICT:\s*/, "") };
    }
    return {
      ok: false,
      code: "COMMIT_FAILED",
      error: msg,
    };
  }
}
