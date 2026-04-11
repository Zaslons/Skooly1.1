import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export type TemporalErrorCode =
  | "INVALID_DATE_RANGE"
  | "ACADEMIC_YEAR_OVERLAP"
  | "ACADEMIC_YEAR_NOT_FOUND"
  | "ACADEMIC_YEAR_ARCHIVED"
  | "TERM_NOT_FOUND"
  | "TERM_OVERLAP"
  | "TERM_OUTSIDE_ACADEMIC_YEAR"
  | "TERM_PARENT_MISMATCH"
  | "NO_ACTIVE_ACADEMIC_YEAR"
  | "NO_ACTIVE_TERM"
  | "ACTIVE_TERM_PARENT_MISMATCH"
  | "SETUP_LOCKED"
  | "CALENDAR_EXCEPTION_OUTSIDE_TERM";

export class TemporalRuleError extends Error {
  code: TemporalErrorCode;
  fieldErrors?: Record<string, string[]>;

  constructor(
    code: TemporalErrorCode,
    message: string,
    fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

const normalizeDate = (date: Date) => new Date(date.getTime());

export function assertStartBeforeEnd(startDate: Date, endDate: Date, entity: "academicYear" | "term") {
  if (startDate >= endDate) {
    throw new TemporalRuleError(
      "INVALID_DATE_RANGE",
      "Start date must be before end date.",
      { endDate: [`${entity} end date must be after start date.`] }
    );
  }
}

/** Calendar exception range must lie within the term (inclusive by instant). */
export function assertCalendarExceptionWithinTerm(params: {
  termStartDate: Date;
  termEndDate: Date;
  exceptionStart: Date;
  exceptionEnd: Date;
}) {
  const { termStartDate, termEndDate, exceptionStart, exceptionEnd } = params;
  if (exceptionStart >= exceptionEnd) {
    throw new TemporalRuleError(
      "INVALID_DATE_RANGE",
      "Calendar exception start must be before end date.",
      { endDate: ["End date must be after start date."] }
    );
  }
  if (exceptionStart < termStartDate || exceptionEnd > termEndDate) {
    throw new TemporalRuleError(
      "CALENDAR_EXCEPTION_OUTSIDE_TERM",
      "Calendar exception dates must fall fully within the term date range."
    );
  }
}

export async function findOverlappingAcademicYear(params: {
  schoolId: string;
  startDate: Date;
  endDate: Date;
  excludeId?: string;
}) {
  const { schoolId, startDate, endDate, excludeId } = params;
  return prisma.academicYear.findFirst({
    where: {
      schoolId,
      isArchived: false,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, name: true },
  });
}

export async function assertNoAcademicYearOverlap(params: {
  schoolId: string;
  startDate: Date;
  endDate: Date;
  excludeId?: string;
}) {
  const overlap = await findOverlappingAcademicYear(params);
  if (overlap) {
    throw new TemporalRuleError(
      "ACADEMIC_YEAR_OVERLAP",
      `Date range overlaps with existing academic year "${overlap.name}".`
    );
  }
}

export async function findAcademicYearForSchool(academicYearId: string, schoolId: string) {
  return prisma.academicYear.findFirst({
    where: { id: academicYearId, schoolId },
    select: { id: true, schoolId: true, startDate: true, endDate: true, isArchived: true, isActive: true },
  });
}

export async function assertAcademicYearWritable(academicYearId: string, schoolId: string) {
  const ay = await findAcademicYearForSchool(academicYearId, schoolId);
  if (!ay) {
    throw new TemporalRuleError("ACADEMIC_YEAR_NOT_FOUND", "Academic year not found.");
  }
  if (ay.isArchived) {
    throw new TemporalRuleError("ACADEMIC_YEAR_ARCHIVED", "Archived academic years cannot be modified.");
  }
  return ay;
}

export async function setSingleActiveAcademicYear(params: {
  tx: Prisma.TransactionClient;
  schoolId: string;
  academicYearId: string;
}) {
  const { tx, schoolId, academicYearId } = params;
  await tx.academicYear.updateMany({
    where: { schoolId, id: { not: academicYearId } },
    data: { isActive: false },
  });

  await tx.academicYear.update({
    where: { id: academicYearId },
    data: { isActive: true, isArchived: false },
  });

  await tx.school.update({
    where: { id: schoolId },
    data: { activeAcademicYearId: academicYearId },
  });
}

export async function findTermForSchool(termId: string, schoolId: string) {
  return prisma.term.findFirst({
    where: { id: termId, schoolId },
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      startDate: true,
      endDate: true,
      isArchived: true,
      isActive: true,
    },
  });
}

export function assertTermWithinAcademicYear(params: {
  termStartDate: Date;
  termEndDate: Date;
  academicYearStartDate: Date;
  academicYearEndDate: Date;
}) {
  const { termStartDate, termEndDate, academicYearStartDate, academicYearEndDate } = params;
  if (termStartDate < academicYearStartDate || termEndDate > academicYearEndDate) {
    throw new TemporalRuleError(
      "TERM_OUTSIDE_ACADEMIC_YEAR",
      "Term date range must be contained within the parent academic year date range.",
      {
        startDate: ["Term start date is outside academic year bounds."],
        endDate: ["Term end date is outside academic year bounds."],
      }
    );
  }
}

export async function findOverlappingTerm(params: {
  schoolId: string;
  academicYearId: string;
  startDate: Date;
  endDate: Date;
  excludeId?: string;
}) {
  const { schoolId, academicYearId, startDate, endDate, excludeId } = params;
  return prisma.term.findFirst({
    where: {
      schoolId,
      academicYearId,
      isArchived: false,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, name: true },
  });
}

export async function assertNoTermOverlap(params: {
  schoolId: string;
  academicYearId: string;
  startDate: Date;
  endDate: Date;
  excludeId?: string;
}) {
  const overlap = await findOverlappingTerm(params);
  if (overlap) {
    throw new TemporalRuleError(
      "TERM_OVERLAP",
      `Date range overlaps with existing term "${overlap.name}".`
    );
  }
}

export async function setSingleActiveTerm(params: {
  tx: Prisma.TransactionClient;
  schoolId: string;
  academicYearId: string;
  termId: string;
}) {
  const { tx, schoolId, academicYearId, termId } = params;
  await tx.term.updateMany({
    where: { schoolId, academicYearId, id: { not: termId } },
    data: { isActive: false },
  });

  await tx.term.update({
    where: { id: termId },
    data: { isActive: true, isArchived: false },
  });
}

export type SchedulingReadiness = {
  isReady: boolean;
  activeAcademicYearId: string | null;
  activeTermId: string | null;
  blockers: string[];
};

export async function getSchedulingReadiness(schoolId: string): Promise<SchedulingReadiness> {
  await ensureAcademicYearRolloverForSchool(schoolId);
  await syncTemporalStatesForSchool(schoolId);

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeAcademicYearId: true },
  });

  if (!school?.activeAcademicYearId) {
    return {
      isReady: false,
      activeAcademicYearId: null,
      activeTermId: null,
      blockers: ["No active academic year is set for this school."],
    };
  }

  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { id: school.activeAcademicYearId, schoolId, isArchived: false },
    select: { id: true },
  });

  if (!activeAcademicYear) {
    return {
      isReady: false,
      activeAcademicYearId: school.activeAcademicYearId,
      activeTermId: null,
      blockers: ["The selected active academic year is archived or invalid."],
    };
  }

  const activeTerm = await prisma.term.findFirst({
    where: {
      schoolId,
      academicYearId: activeAcademicYear.id,
      isActive: true,
      isArchived: false,
    },
    select: { id: true },
  });

  if (!activeTerm) {
    return {
      isReady: false,
      activeAcademicYearId: activeAcademicYear.id,
      activeTermId: null,
      blockers: ["No active term exists inside the active academic year."],
    };
  }

  return {
    isReady: true,
    activeAcademicYearId: activeAcademicYear.id,
    activeTermId: activeTerm.id,
    blockers: [],
  };
}

export async function assertSchedulingReadinessOrThrow(schoolId: string) {
  const readiness = await getSchedulingReadiness(schoolId);
  if (!readiness.isReady) {
    throw new TemporalRuleError(
      "NO_ACTIVE_TERM",
      readiness.blockers[0] ?? "School scheduling prerequisites are not satisfied."
    );
  }
  return readiness;
}

export type SetupStepKey =
  | "staticInitialization"
  | "temporalInitialization"
  | "gridInitialization"
  | "curriculumMapping"
  | "dsRecurringExams"
  | "generateTerm";

export type SetupStepState = {
  key: SetupStepKey;
  title: string;
  complete: boolean;
  locked: boolean;
  optional: boolean;
  blockers: string[];
  fixHref: string;
};

export type SchedulingSetupStatus = {
  schoolId: string;
  isReady: boolean;
  canGenerate: boolean;
  blockers: string[];
  /** E7: when false, commit operations (term generation commit, DS recurring commit) are blocked. */
  schedulingPipelineEnabled: boolean;
  steps: Record<SetupStepKey, SetupStepState>;
  checklist: { label: string; complete: boolean; blockers: string[] }[];
  ids: {
    activeAcademicYearId: string | null;
    activeTermId: string | null;
  };
};

function requiredStepKeysFor(targetStep: SetupStepKey): SetupStepKey[] {
  const chain: SetupStepKey[] = [
    "staticInitialization",
    "temporalInitialization",
    "gridInitialization",
    "curriculumMapping",
  ];
  switch (targetStep) {
    case "staticInitialization":
      return ["staticInitialization"];
    case "temporalInitialization":
      return ["staticInitialization", "temporalInitialization"];
    case "gridInitialization":
      return ["staticInitialization", "temporalInitialization", "gridInitialization"];
    case "curriculumMapping":
      return chain;
    case "dsRecurringExams":
      return chain;
    case "generateTerm":
      return chain;
    default:
      return chain;
  }
}

/** Phase 5: grid step complete only when weekly lessons exist and at least one active bell period. */
export function isGridInitializationComplete(lessonCount: number, activePeriodCount: number): boolean {
  return lessonCount > 0 && activePeriodCount > 0;
}

export function buildGridInitializationBlockers(lessonCount: number, activePeriodCount: number): string[] {
  const blockers: string[] = [];
  if (lessonCount === 0) blockers.push("No lessons configured yet.");
  if (activePeriodCount === 0) blockers.push("No active bell periods defined.");
  return blockers;
}

export async function getSchedulingSetupStatus(
  schoolId: string
): Promise<SchedulingSetupStatus> {
  await ensureAcademicYearRolloverForSchool(schoolId);
  await syncTemporalStatesForSchool(schoolId);

  const [readiness, staticCounts, lessonCount, curriculumCount, examTemplateCount, schoolRow, activePeriodCount] =
    await Promise.all([
      getSchedulingReadiness(schoolId),
      Promise.all([
        prisma.grade.count({ where: { schoolId } }),
        prisma.subject.count({ where: { schoolId } }),
        prisma.teacher.count({ where: { schoolId } }),
        prisma.class.count({ where: { schoolId } }),
      ]),
      prisma.lesson.count({ where: { schoolId } }),
      prisma.curriculum.count({ where: { schoolId } }),
      prisma.examTemplate.count({ where: { schoolId } }),
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { schedulingPipelineEnabled: true },
      }),
      prisma.period.count({ where: { schoolId, isArchived: false } }),
    ]);

  const schedulingPipelineEnabled = schoolRow?.schedulingPipelineEnabled !== false;

  const [gradeCount, subjectCount, teacherCount, classCount] = staticCounts;

  const staticBlockers: string[] = [];
  if (gradeCount === 0) staticBlockers.push("No grades configured.");
  if (subjectCount === 0) staticBlockers.push("No subjects configured.");
  if (teacherCount === 0) staticBlockers.push("No teachers configured.");
  if (classCount === 0) staticBlockers.push("No classes configured.");

  const temporalBlockers = readiness.isReady ? [] : readiness.blockers.filter(Boolean);

  const staticComplete = staticBlockers.length === 0;
  const temporalComplete = readiness.isReady;
  const gridComplete = isGridInitializationComplete(lessonCount, activePeriodCount);
  const curriculumComplete = curriculumCount > 0;
  const dsRecurringExamsComplete = examTemplateCount > 0;

  const gridBlockers = gridComplete ? [] : buildGridInitializationBlockers(lessonCount, activePeriodCount);
  const curriculumBlockers = curriculumComplete ? [] : ["No curriculum mapping exists."];

  const staticFixHref = `/schools/${schoolId}/list/grades`;
  const temporalFixHref = `/schools/${schoolId}/academic-years`;
  const gridFixHref = `/schools/${schoolId}/admin/schedule`;
  const bellScheduleFixHref = `/schools/${schoolId}/admin/setup/bell-schedule`;
  const curriculumFixHref = readiness.activeAcademicYearId
    ? `/schools/${schoolId}/academic-years/${readiness.activeAcademicYearId}/curriculum`
    : `/schools/${schoolId}/academic-years`;

  const requiredChainComplete = staticComplete && temporalComplete && gridComplete && curriculumComplete;

  const firstMissingFixHref = (neededKeys: SetupStepKey[]) => {
    for (const key of neededKeys) {
      if (key === "staticInitialization" && !staticComplete) return staticFixHref;
      if (key === "temporalInitialization" && !temporalComplete) return temporalFixHref;
      if (key === "gridInitialization" && !gridComplete) {
        if (lessonCount === 0) return gridFixHref;
        if (activePeriodCount === 0) return bellScheduleFixHref;
        return gridFixHref;
      }
      if (key === "curriculumMapping" && !curriculumComplete) return curriculumFixHref;
    }
    return `/schools/${schoolId}/admin/schedule`;
  };

  // Step "complete" is defined as: the prerequisites for that step (as per requiredStepKeysFor)
  // are met. This keeps lock-state parity with server guards (which use the same step-key model).
  const steps: Record<SetupStepKey, SetupStepState> = {
    staticInitialization: {
      key: "staticInitialization",
      title: "Static Initialization",
      complete: staticComplete,
      locked: false, // computed below for required chain order
      optional: false,
      blockers: staticBlockers,
      fixHref: staticFixHref,
    },
    temporalInitialization: {
      key: "temporalInitialization",
      title: "Temporal Initialization",
      complete: staticComplete && temporalComplete,
      locked: false, // computed below for required chain order
      optional: false,
      blockers: [...staticBlockers, ...temporalBlockers],
      fixHref: firstMissingFixHref(["staticInitialization", "temporalInitialization"]),
    },
    gridInitialization: {
      key: "gridInitialization",
      title: "Grid Initialization",
      complete: staticComplete && temporalComplete && gridComplete,
      locked: false, // computed below for required chain order
      optional: false,
      blockers: [...staticBlockers, ...temporalBlockers, ...gridBlockers],
      fixHref: firstMissingFixHref(["staticInitialization", "temporalInitialization", "gridInitialization"]),
    },
    curriculumMapping: {
      key: "curriculumMapping",
      title: "Curriculum Mapping",
      complete: staticComplete && temporalComplete && gridComplete && curriculumComplete,
      locked: false, // computed below for required chain order
      optional: false,
      blockers: [...staticBlockers, ...temporalBlockers, ...gridBlockers, ...curriculumBlockers],
      fixHref: firstMissingFixHref([
        "staticInitialization",
        "temporalInitialization",
        "gridInitialization",
        "curriculumMapping",
      ]),
    },
    dsRecurringExams: {
      key: "dsRecurringExams",
      title: "DS Recurring Exams (Optional)",
      // Guard parity: create/update DS templates are protected by the same required chain.
      complete: requiredChainComplete && dsRecurringExamsComplete,
      locked: !requiredChainComplete,
      optional: true,
      blockers: requiredChainComplete
        ? dsRecurringExamsComplete
          ? []
          : ["No recurring exam templates configured."]
        : [...staticBlockers, ...temporalBlockers, ...gridBlockers, ...curriculumBlockers],
      fixHref: requiredChainComplete
        ? `/schools/${schoolId}/admin/setup/recurring-exams`
        : firstMissingFixHref([
            "staticInitialization",
            "temporalInitialization",
            "gridInitialization",
            "curriculumMapping",
          ]),
    },
    generateTerm: {
      key: "generateTerm",
      title: "Generate Term",
      complete: staticComplete && temporalComplete && gridComplete && curriculumComplete,
      locked: true, // computed below
      optional: false,
      blockers: [],
      fixHref: `/schools/${schoolId}/admin/schedule`,
    },
  };

  const requiredChain: SetupStepKey[] = [
    "staticInitialization",
    "temporalInitialization",
    "gridInitialization",
    "curriculumMapping",
  ];

  // Lock order: the first incomplete required step stays unlocked; everything after is locked.
  let firstIncompleteRequiredStep: SetupStepKey | null = null;
  for (const key of requiredChain) {
    if (steps[key].complete) {
      steps[key].locked = false;
      continue;
    }
    if (firstIncompleteRequiredStep === null) {
      firstIncompleteRequiredStep = key;
      steps[key].locked = false;
    } else {
      steps[key].locked = true;
    }
  }

  steps.generateTerm.locked = requiredChain.some((key) => !steps[key].complete);
  steps.generateTerm.blockers = steps.generateTerm.locked
    ? [...staticBlockers, ...temporalBlockers, ...gridBlockers, ...curriculumBlockers]
    : [];

  if (!schedulingPipelineEnabled) {
    steps.generateTerm.blockers = [
      ...steps.generateTerm.blockers,
      "Scheduling pipeline commits are disabled for this school (rollout / ops toggle). Dry-run preview may still be available from the schedule UI.",
    ];
  }

  const blockers = steps.generateTerm.blockers;
  const canGenerate = steps.generateTerm.complete && schedulingPipelineEnabled;
  const checklist = requiredChain.map((key) => ({
    label: steps[key].title,
    complete: steps[key].complete,
    blockers: steps[key].blockers,
  }));

  return {
    schoolId,
    isReady: blockers.length === 0,
    canGenerate,
    blockers,
    schedulingPipelineEnabled,
    steps,
    checklist,
    ids: {
      activeAcademicYearId: readiness.activeAcademicYearId,
      activeTermId: readiness.activeTermId,
    },
  };
}

export async function assertSetupStepReadyOrThrow(
  schoolId: string,
  targetStep: SetupStepKey
) {
  const status = await getSchedulingSetupStatus(schoolId);
  const needed = requiredStepKeysFor(targetStep);
  const failed = needed
    .map((key) => status.steps[key])
    .filter((step) => !step.complete);

  if (failed.length > 0) {
    const primary = failed[0];
    throw new TemporalRuleError(
      "SETUP_LOCKED",
      `${primary.title} is incomplete. ${primary.blockers[0] ?? "Complete setup prerequisites first."}`
    );
  }

  return status;
}

export function toDate(input: Date | string) {
  return normalizeDate(new Date(input));
}

function shiftDateByMs(date: Date, msOffset: number) {
  return new Date(date.getTime() + msOffset);
}

function generateNextAcademicYearName(prevName: string) {
  const range = prevName.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const start = Number(range[1]) + 1;
    const end = Number(range[2]) + 1;
    return `${start}-${end}`;
  }
  return `${prevName} (Next)`;
}

async function generateUniqueAcademicYearName(schoolId: string, baseName: string) {
  let candidate = baseName;
  let suffix = 1;
  while (true) {
    const exists = await prisma.academicYear.findFirst({
      where: { schoolId, name: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    suffix += 1;
    candidate = `${baseName} (${suffix})`;
  }
}

export async function syncTemporalStatesForSchool(schoolId: string) {
  const now = new Date();
  const currentAcademicYear = await prisma.academicYear.findFirst({
    where: {
      schoolId,
      isArchived: false,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: { startDate: "desc" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({
      where: { schoolId },
      data: { isActive: false },
    });

    if (!currentAcademicYear) {
      await tx.school.update({
        where: { id: schoolId },
        data: { activeAcademicYearId: null },
      });
      await tx.term.updateMany({
        where: { schoolId },
        data: { isActive: false },
      });
      return;
    }

    await tx.academicYear.update({
      where: { id: currentAcademicYear.id },
      data: { isActive: true },
    });

    await tx.school.update({
      where: { id: schoolId },
      data: { activeAcademicYearId: currentAcademicYear.id },
    });

    await tx.term.updateMany({
      where: { schoolId },
      data: { isActive: false },
    });

    const currentTerm = await tx.term.findFirst({
      where: {
        schoolId,
        academicYearId: currentAcademicYear.id,
        isArchived: false,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { startDate: "desc" },
      select: { id: true },
    });

    if (currentTerm) {
      await tx.term.update({
        where: { id: currentTerm.id },
        data: { isActive: true },
      });
    }
  });
}

export async function ensureAcademicYearRolloverForSchool(schoolId: string) {
  const years = await prisma.academicYear.findMany({
    where: { schoolId, isArchived: false },
    orderBy: { startDate: "asc" },
    include: {
      terms: {
        where: { isArchived: false },
        orderBy: { startDate: "asc" },
      },
    },
  });

  if (years.length === 0) return;
  const now = new Date();
  const manuallyActivated = years.find((y) => y.isActive && !y.isArchived) ?? null;
  const dateActive =
    years.find((y) => !y.isArchived && y.startDate <= now && y.endDate >= now) ?? null;
  const reference = manuallyActivated ?? dateActive ?? years[years.length - 1];

  // If there is already a year starting after reference, nothing to do.
  const existingNext = await prisma.academicYear.findFirst({
    where: { schoolId, startDate: { gt: reference.startDate } },
    select: { id: true },
  });
  if (existingNext) return;

  const msOffset = reference.endDate.getTime() - reference.startDate.getTime() + 24 * 60 * 60 * 1000;
  const nextStartYear = reference.startDate.getFullYear() + 1;
  // Default school template: September to June/July
  const templateEndMonth = reference.endDate.getMonth() === 6 ? 6 : 5; // 6=Jul, 5=Jun
  const templateEndDay = templateEndMonth === 6 ? 31 : 30;
  const nextStart = new Date(nextStartYear, 8, 1); // Sep 1
  const nextEnd = new Date(nextStartYear + 1, templateEndMonth, templateEndDay);

  const nextName = await generateUniqueAcademicYearName(
    schoolId,
    generateNextAcademicYearName(reference.name)
  );

  await prisma.$transaction(async (tx) => {
    const createdYear = await tx.academicYear.create({
      data: {
        schoolId,
        name: nextName,
        startDate: nextStart,
        endDate: nextEnd,
        isActive: false,
        isArchived: false,
      },
    });

    if (reference.terms.length === 0) return;
    for (const term of reference.terms) {
      const termStart = shiftDateByMs(term.startDate, msOffset);
      const termEnd = shiftDateByMs(term.endDate, msOffset);
      if (termStart < createdYear.startDate || termEnd > createdYear.endDate) {
        continue;
      }
      await tx.term.create({
        data: {
          schoolId,
          academicYearId: createdYear.id,
          name: term.name,
          startDate: termStart,
          endDate: termEnd,
          isActive: false,
          isArchived: false,
        },
      });
    }
  });
}

export async function cloneTermPatternToAcademicYear(params: {
  tx: Prisma.TransactionClient;
  schoolId: string;
  sourceAcademicYearId: string;
  targetAcademicYearId: string;
  sourceAcademicYearStart: Date;
  targetAcademicYearStart: Date;
  targetAcademicYearEnd: Date;
}) {
  const {
    tx,
    schoolId,
    sourceAcademicYearId,
    targetAcademicYearId,
    sourceAcademicYearStart,
    targetAcademicYearStart,
    targetAcademicYearEnd,
  } = params;

  const sourceTerms = await tx.term.findMany({
    where: { schoolId, academicYearId: sourceAcademicYearId, isArchived: false },
    orderBy: [{ startDate: "asc" }],
  });

  if (sourceTerms.length === 0) return;
  const offsetMs = targetAcademicYearStart.getTime() - sourceAcademicYearStart.getTime();

  for (const term of sourceTerms) {
    const startDate = shiftDateByMs(term.startDate, offsetMs);
    const endDate = shiftDateByMs(term.endDate, offsetMs);
    if (startDate < targetAcademicYearStart || endDate > targetAcademicYearEnd) continue;
    await tx.term.create({
      data: {
        schoolId,
        academicYearId: targetAcademicYearId,
        name: term.name,
        startDate,
        endDate,
        isActive: false,
        isArchived: false,
      },
    });
  }
}
