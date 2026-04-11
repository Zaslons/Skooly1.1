import { z } from "zod";
import {
  CalendarExceptionType,
  Day,
  ExamCategory,
  LessonDeliveryMode,
} from "@prisma/client";

export const subjectSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "Subject name is required!" }),
  teachers: z.array(z.string()), //teacher ids
});

export type SubjectSchema = z.infer<typeof subjectSchema>;

export const classSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "Class name is required!" }),
  capacity: z.coerce.number().min(1, { message: "Capacity is required!" }),
  gradeId: z.coerce.number().min(1, { message: "Grade is required!" }),
  supervisorId: z.string().optional(),
  academicYearId: z.string().cuid({ message: "Valid Academic Year ID is required."}).optional(),
});

export type ClassSchema = z.infer<typeof classSchema>;

export const teacherSchema = z.object({
  id: z.string().optional(),
  username: z
    .string()
    .min(3, { message: "Username must be at least 3 characters long!" })
    .max(20, { message: "Username must be at most 20 characters long!" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long!" })
    .optional()
    .or(z.literal("")),
  name: z.string().min(1, { message: "First name is required!" }),
  surname: z.string().min(1, { message: "Last name is required!" }),
  email: z
    .string()
    .email({ message: "Invalid email address!" })
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
  address: z.string(),
  img: z.string().optional(),
  bloodType: z.string().min(1, { message: "Blood Type is required!" }),
  birthday: z.coerce.date({ message: "Birthday is required!" }),
  sex: z.enum(["MALE", "FEMALE"], { message: "Sex is required!" }),
  subjects: z.array(z.string()).optional(), // subject ids
});

export type TeacherSchema = z.infer<typeof teacherSchema>;

export const studentSchema = z.object({
  id: z.string().optional(),
  username: z
    .string()
    .min(3, { message: "Username must be at least 3 characters long!" })
    .max(20, { message: "Username must be at most 20 characters long!" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long!" })
    .optional()
    .or(z.literal("")),
  name: z.string().min(1, { message: "First name is required!" }),
  surname: z.string().min(1, { message: "Last name is required!" }),
  email: z
    .string()
    .email({ message: "Invalid email format." })
    .optional()
    .nullable()
    .or(z.literal("")),
  phone: z
    .string()
    .optional()
    .nullable()
    .or(z.literal("")),
  address: z.string(),
  img: z
    .string()
    .url({ message: "Invalid URL format." })
    .optional()
    .nullable()
    .or(z.literal("")),
  bloodType: z.string().min(1, { message: "Blood Type is required!" }),
  birthday: z.coerce.date({ message: "Birthday is required!" }),
  sex: z.enum(["MALE", "FEMALE"], { message: "Sex is required!" }),
  gradeId: z.coerce.number().min(1, { message: "Grade is required!" }),
  classId: z.coerce.number().min(1, { message: "Class is required!" }),
  parentId: z.string().min(1, { message: "Parent Id is required!" }),
});

export type StudentSchema = z.infer<typeof studentSchema>;

export const examSchema = z.object({
  id: z.coerce.number().optional(),
  title: z.string().min(1, { message: "Title name is required!" }),
  startTime: z.coerce.date({ message: "Start time is required!" }),
  endTime: z.coerce.date().optional(),
  durationMinutes: z.coerce
    .number()
    .int({ message: "Duration must be a whole number of minutes." })
    .min(1, { message: "Duration must be at least 1 minute." }),
  lessonId: z.coerce.number({ message: "Lesson is required!" }),
  examPeriodId: z.string().cuid({ message: "Invalid exam period." }).optional().nullable(),
  isRecurring: z.coerce.boolean().optional().default(false),
  examCategory: z.nativeEnum(ExamCategory).default(ExamCategory.COURSE_EXAM),
  maxScore: z.coerce.number().min(1, { message: "Max score must be at least 1" }).default(100),
  weight: z.coerce.number().min(0.1, { message: "Weight must be at least 0.1" }).default(1.0),
}).superRefine((data, ctx) => {
  const computedEnd = new Date(data.startTime.getTime() + data.durationMinutes * 60 * 1000);
  if (data.endTime && data.endTime.getTime() !== computedEnd.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "End time must equal start time plus duration.",
    });
  }
});

export type ExamSchema = z.infer<typeof examSchema>;

// Weekly exam template (Phase 2/5)
export const examTemplateSchema = z.object({
  id: z.string().cuid().optional(),
  termId: z.string().cuid({ message: "Valid term ID is required." }),

  title: z.string().min(1).optional().nullable(),

  day: z.nativeEnum(Day, {
    errorMap: () => ({ message: "Please select a valid day." })
  }),
  startTime: z.coerce.date({ message: "Start time is required!" }),
  endTime: z.coerce.date({ message: "End time is required!" }),

  classId: z.coerce.number({ message: "Class is required!" }),
  subjectId: z.coerce.number({ message: "Subject is required!" }),

  teacherId: z.string().cuid().optional().nullable(),
  roomId: z.coerce.number().optional().nullable(),
});

export type ExamTemplateSchema = z.infer<typeof examTemplateSchema>;

// Weekly DS recurring exam builder payload (E3)
// Payload is intentionally loop-oriented (week-by-week rows).
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "Start time must be in HH:MM format.",
  });

export const recurringExamLoopItemSchema = z.object({
  weekIndex: z.number().int().min(0, { message: "weekIndex must be >= 0." }),
  day: z.nativeEnum(Day, {
    errorMap: () => ({ message: "Please select a valid day." }),
  }),
  startTime: timeOfDaySchema,
  durationMinutes: z
    .number()
    .int({ message: "durationMinutes must be an integer." })
    .min(1, { message: "durationMinutes must be at least 1." }),

  classId: z.coerce.number().int({ message: "classId must be a number." }).min(1),
  subjectId: z.coerce.number().int({ message: "subjectId must be a number." }).min(1),

  roomId: z.coerce.number().int().optional().nullable(),
  teacherId: z.string().cuid().optional().nullable(),
});

export type RecurringExamLoopItem = z.infer<typeof recurringExamLoopItemSchema>;

export const recurringExamsPayloadSchema = z.object({
  termId: z.string().cuid({ message: "Valid term ID is required." }),
  loops: z.array(recurringExamLoopItemSchema).min(1, { message: "At least one loop row is required." }),

  // Commit controls (preview can also accept this for deterministic output).
  strictMode: z.coerce.boolean().optional().default(true),

  // Exam defaults applied to created Exam rows.
  maxScore: z.coerce.number().min(1).optional().default(100),
  weight: z.coerce.number().min(0.1).optional().default(1.0),

  titlePrefix: z.string().min(1).optional().nullable(),
});

export type RecurringExamsPayload = z.infer<typeof recurringExamsPayloadSchema>;

export const termSchema = z.object({
  id: z.string().cuid().optional(),
  academicYearId: z.string().cuid({ message: "Valid academic year ID is required." }),
  name: z.string().min(1, { message: "Term name is required." }),
  startDate: z.coerce.date({ message: "Start date is required." }),
  endDate: z.coerce.date({ message: "End date is required." }),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
}).refine((data) => data.endDate > data.startDate, {
  message: "Term end date must be after start date.",
  path: ["endDate"],
});

export type TermSchema = z.infer<typeof termSchema>;

// E4 Term Lesson Generation Engine (generate-term-schedule)
export const generateTermScheduleModeSchema = z.enum(["dryRun", "commit"]);

export const generateTermScheduleScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("school") }),
  z.object({
    type: z.literal("grade"),
    gradeId: z.coerce.number().int().positive({ message: "gradeId must be a positive integer." }),
  }),
  z.object({
    type: z.literal("class"),
    classId: z.coerce.number().int().positive({ message: "classId must be a positive integer." }),
  }),
]);

export type GenerateTermScheduleScope = z.infer<typeof generateTermScheduleScopeSchema>;

export const termLessonSkipReasonSchema = z.enum([
  "HOLIDAY",
  "BREAK",
  "EXAM_PERIOD",
  "ALREADY_EXISTS",
  "EXAM_CONFLICT",
  "EXAM_CONFLICT_UNKNOWN",
  "TEACHER_TIME_CONFLICT",
]);

export const generateTermScheduleRequestSchema = z.object({
  termId: z.string().cuid({ message: "Valid term ID is required." }),
  mode: generateTermScheduleModeSchema,
  idempotencyKey: z.string().min(1, { message: "idempotencyKey is required." }),
  scope: generateTermScheduleScopeSchema.optional().default({ type: "school" }),
  // For rollback validation: fail deterministically at the Nth occurrence in the
  // generator's deterministic candidate ordering.
  simulateFailureAtOccurrenceIndex: z
    .number()
    .int()
    .nonnegative()
    .optional(),
});

export type GenerateTermScheduleRequest = z.infer<typeof generateTermScheduleRequestSchema>;

export const termLessonConflictDetailSchema = z.object({
  sessionDate: z.coerce.date(),
  templateLessonId: z.number().int(),
  reason: z.enum(["EXAM_CONFLICT_UNKNOWN", "EXAM_CONFLICT", "TEACHER_TIME_CONFLICT"]),
  overlappingExamIds: z.array(z.number().int()).default([]),
  overlappingExamLessonIds: z.array(z.number().int()).optional().default([]),
  overlappingLessonSessionIds: z.array(z.number().int()).optional().default([]),
});

export const generateTermScheduleSummarySchema = z.object({
  totalCandidates: z.number().int().nonnegative(),
  createdCount: z.number().int().nonnegative(),
  conflictedCount: z.number().int().nonnegative(),
  skippedByReason: z.record(
    termLessonSkipReasonSchema,
    z.number().int().nonnegative()
  ),
});

export const generateTermScheduleResponseSchema = z.object({
  requestId: z.string().min(1),
  termId: z.string().cuid(),
  durationMs: z.number().int().nonnegative(),
  scope: generateTermScheduleScopeSchema,
  summary: generateTermScheduleSummarySchema,
  conflicts: z.array(termLessonConflictDetailSchema),
  /** True when commit reused a prior successful run for the same idempotency key + scope. */
  idempotentReplay: z.boolean().optional(),
});

export type GenerateTermScheduleResponse = z.infer<typeof generateTermScheduleResponseSchema>;

/** POST /api/schools/[schoolId]/terms/[termId]/calendar-exceptions */
export const schoolCalendarExceptionCreateSchema = z.object({
  title: z.string().min(1, { message: "Title is required." }),
  type: z.nativeEnum(CalendarExceptionType),
  startDate: z.coerce.date({ message: "Start date is required." }),
  endDate: z.coerce.date({ message: "End date is required." }),
  notes: z.string().max(8000).optional().nullable(),
});

export type SchoolCalendarExceptionCreateInput = z.infer<typeof schoolCalendarExceptionCreateSchema>;

/** PATCH /api/schools/[schoolId]/terms/[termId]/calendar-exceptions/[exceptionId] */
export const schoolCalendarExceptionUpdateSchema = z
  .object({
    title: z.string().min(1, { message: "Title is required." }).optional(),
    type: z.nativeEnum(CalendarExceptionType).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    notes: z.string().max(8000).optional().nullable(),
  })
  .refine(
    (d) => {
      if (d.startDate != null && d.endDate != null) return d.startDate < d.endDate;
      return true;
    },
    { message: "End date must be after start date.", path: ["endDate"] }
  );

export type SchoolCalendarExceptionUpdateInput = z.infer<typeof schoolCalendarExceptionUpdateSchema>;

/** Bell schedule — POST /api/schools/[schoolId]/periods */
export const periodCreateSchema = z
  .object({
    name: z.string().min(1, { message: "Period name is required." }),
    startTime: z.coerce.date({ message: "Start time is required." }),
    endTime: z.coerce.date({ message: "End time is required." }),
    /** Omit to append after the current max `order` for the school. */
    order: z.coerce.number().int().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "End time must be after start time.",
    path: ["endTime"],
  });

export type PeriodCreateInput = z.infer<typeof periodCreateSchema>;

/** Bell schedule — PATCH /api/schools/[schoolId]/periods/[periodId] */
export const periodUpdateSchema = z
  .object({
    name: z.string().min(1, { message: "Name cannot be empty." }).optional(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    order: z.coerce.number().int().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine(
    (d) => {
      if (d.startTime != null && d.endTime != null) return d.startTime < d.endTime;
      return true;
    },
    { message: "End time must be after start time.", path: ["endTime"] }
  );

export type PeriodUpdateInput = z.infer<typeof periodUpdateSchema>;

// E5: instance-only edits (LessonSession), never mutates Lesson template
const optionalHttpUrl = z.preprocess(
  (val) => (val === "" || val === undefined ? undefined : val === null ? null : val),
  z.union([z.string().url({ message: "Must be a valid URL." }), z.null()]).optional()
);

const optionalShortLabel = z.preprocess(
  (val) => (val === "" || val === undefined ? undefined : val === null ? null : val),
  z.union([z.string().max(200), z.null()]).optional()
);

export const lessonSessionInstancePatchSchema = z.object({
  status: z.enum(["SCHEDULED", "CANCELLED"]).optional(),
  substituteTeacherId: z.string().cuid().nullable().optional(),
  overrideRoomId: z.coerce.number().int().positive().nullable().optional(),
  instanceNotes: z.string().max(2000).nullable().optional(),
  lastOverrideReason: z.string().max(500).nullable().optional(),
  // Optional reschedule of this instance only (does not change weekly template)
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  meetingUrl: optionalHttpUrl,
  meetingLabel: optionalShortLabel,
});

export type LessonSessionInstancePatch = z.infer<typeof lessonSessionInstancePatchSchema>;

export const lessonSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1, { message: "Lesson name is required!" }),
  day: z.nativeEnum(Day, {
    errorMap: () => ({ message: "Please select a valid day." })
  }),
  startTime: z.coerce.date({ message: "Start time is required!" }),
  endTime: z.coerce.date({ message: "End time is required!" }),
  subjectId: z.coerce.number({ message: "Subject is required!" }),
  classId: z.coerce.number({ message: "Class is required!" }),
  teacherId: z.string().min(1, { message: "Teacher is required!" }),
  deliveryMode: z
    .nativeEnum(LessonDeliveryMode)
    .default(LessonDeliveryMode.IN_PERSON),
  roomId: z.coerce.number().optional().nullable(),
  /** Optional bell schedule period (weekly template); empty string cleared in preprocess */
  periodId: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.string().cuid({ message: "Invalid bell period." }).optional()
  ),
  /** End period for multi-block (double/triple); null = single period. If set, must differ from periodId. */
  endPeriodId: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.string().cuid({ message: "Invalid end period." }).optional().nullable()
  ),
  meetingUrl: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : val),
    z.union([z.string().url({ message: "Meeting link must be a valid URL." }), z.null()]).optional()
  ),
  meetingLabel: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : val),
    z.union([z.string().max(200), z.null()]).optional()
  ),
}).superRefine((data, ctx) => {
  if (data.deliveryMode === LessonDeliveryMode.IN_PERSON) {
    if (data.meetingUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meetingUrl"],
        message: "Meeting link is only for online lessons.",
      });
    }
    if (data.meetingLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meetingLabel"],
        message: "Meeting label is only for online lessons.",
      });
    }
  }
  if (data.endPeriodId != null && data.endPeriodId !== "") {
    if (!data.periodId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endPeriodId"], message: "Start period is required when end period is set." });
    } else if (data.endPeriodId === data.periodId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endPeriodId"], message: "End period must differ from start period for multi-block; use single period otherwise." });
    }
  }
});

export type LessonSchema = z.infer<typeof lessonSchema>;

/** Max consecutive periods in one timetable block (greedy assistant). */
export const TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX = 8;

/** Assisted weekly timetable (see docs/timetable/TIMETABLE_ASSISTANT_MVP.md). */
const timetableAssistantMeetingUrlField = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? null : val),
  z.union([z.string().url({ message: "Meeting link must be a valid URL." }), z.null()]).optional()
);

const timetableAssistantMeetingLabelField = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? null : val),
  z.union([z.string().max(200), z.null()]).optional()
);

function refineTimetableAssistantDeliveryMode(
  data: {
    deliveryMode?: LessonDeliveryMode;
    roomId?: number | null;
    meetingUrl?: string | null;
    meetingLabel?: string | null;
  },
  ctx: z.RefinementCtx
) {
  const mode = data.deliveryMode ?? LessonDeliveryMode.IN_PERSON;
  if (mode === LessonDeliveryMode.IN_PERSON) {
    if (data.meetingUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meetingUrl"],
        message: "Meeting link is only for online lessons.",
      });
    }
    if (data.meetingLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meetingLabel"],
        message: "Meeting label is only for online lessons.",
      });
    }
  }
  if (mode === LessonDeliveryMode.ONLINE && data.roomId != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["roomId"],
      message: "Online lessons cannot assign a room in the assistant.",
    });
  }
}

export const timetableAssistantRequirementSchema = z
  .object({
    subjectId: z.coerce.number().int().positive(),
    teacherId: z.string().min(1),
    periodsPerWeek: z.coerce.number().int().min(1).max(40),
    blockSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX)
      .optional()
      .default(1),
    roomId: z.coerce.number().int().positive().nullable().optional(),
    deliveryMode: z.nativeEnum(LessonDeliveryMode).optional(),
    meetingUrl: timetableAssistantMeetingUrlField,
    meetingLabel: timetableAssistantMeetingLabelField,
  })
  .superRefine(refineTimetableAssistantDeliveryMode);

export const timetableAssistantBodySchema = z.object({
  classId: z.coerce.number().int().positive(),
  requirements: z.array(timetableAssistantRequirementSchema).min(1).max(50),
  replaceExistingClassLessons: z.boolean().optional().default(false),
});

export type TimetableAssistantBody = z.infer<typeof timetableAssistantBodySchema>;

export const timetableAssistantSchoolScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("school") }),
  z.object({ type: z.literal("grade"), gradeId: z.coerce.number().int().positive() }),
  z.object({
    type: z.literal("classIds"),
    ids: z.array(z.coerce.number().int().positive()).min(1).max(200),
  }),
]);

export const timetableAssistantSchoolRequirementSchema = z
  .object({
    classId: z.coerce.number().int().positive(),
    subjectId: z.coerce.number().int().positive(),
    teacherId: z.string().min(1),
    periodsPerWeek: z.coerce.number().int().min(1).max(40),
    blockSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX)
      .optional()
      .default(1),
    roomId: z.coerce.number().int().positive().nullable().optional(),
    deliveryMode: z.nativeEnum(LessonDeliveryMode).optional(),
    meetingUrl: timetableAssistantMeetingUrlField,
    meetingLabel: timetableAssistantMeetingLabelField,
  })
  .superRefine(refineTimetableAssistantDeliveryMode);

export const timetableAssistantSchoolBodySchema = z.object({
  scope: timetableAssistantSchoolScopeSchema,
  requirements: z.array(timetableAssistantSchoolRequirementSchema).min(1).max(200),
  replaceScope: z.enum(["none", "affected_classes", "school"]).optional().default("none"),
});

export type TimetableAssistantSchoolBody = z.infer<typeof timetableAssistantSchoolBodySchema>;

/** Class-agnostic requirement row for per-grade timetable templates (whole-school assistant). */
export const timetableAssistantSchoolTemplateRowSchema = z
  .object({
    subjectId: z.coerce.number().int().positive(),
    teacherId: z.string().min(1),
    periodsPerWeek: z.coerce.number().int().min(1).max(40),
    blockSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(TIMETABLE_ASSISTANT_BLOCK_SIZE_MAX)
      .optional()
      .default(1),
    roomId: z.coerce.number().int().positive().nullable().optional(),
    deliveryMode: z.nativeEnum(LessonDeliveryMode).optional(),
    meetingUrl: timetableAssistantMeetingUrlField,
    meetingLabel: timetableAssistantMeetingLabelField,
  })
  .superRefine(refineTimetableAssistantDeliveryMode);

export const timetableAssistantSchoolTemplateRowsSchema = z
  .array(timetableAssistantSchoolTemplateRowSchema)
  .max(200);

export type TimetableAssistantSchoolTemplateRow = z.infer<typeof timetableAssistantSchoolTemplateRowSchema>;

export const assignmentSchema = z.object({
  id: z.coerce.number().optional(),
  title: z.string().min(1, { message: "Title is required!" }),
  startDate: z.coerce.date({ message: "Start date is required!" }),
  /** Legacy override; E6 computes from due lesson + term when omitted. */
  dueDate: z.coerce.date().optional().nullable(),
  lessonId: z.coerce.number({ message: "Lesson is required!" }), // source/context lesson
  dueLessonId: z.coerce.number({ message: "Due lesson is required!" }),
  maxScore: z.coerce.number().min(1, { message: "Max score must be at least 1" }).default(100),
  weight: z.coerce.number().min(0.1, { message: "Weight must be at least 0.1" }).default(1.0),
}).superRefine((data, ctx) => {
  if (data.dueDate && data.dueDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dueDate"],
      message: "Due date cannot be before the start date.",
    });
  }
});

export type AssignmentSchema = z.infer<typeof assignmentSchema>;

export const parentSchema = z.object({
  id: z.string().optional(),
  username: z
    .string()
    .min(3, { message: "Username must be at least 3 characters long!" })
    .max(20, { message: "Username must be at most 20 characters long!" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long!" })
    .optional()
    .or(z.literal("")),
  name: z.string().min(1, { message: "First name is required!" }),
  surname: z.string().min(1, { message: "Last name is required!" }),
  email: z
    .string()
    .email({ message: "Invalid email address!" })
    .optional()
    .or(z.literal("")),
  phone: z.string().min(1, { message: "Phone number is required!" }),
  address: z.string().min(1, { message: "Address is required!" }),
});

export type ParentSchema = z.infer<typeof parentSchema>;

export const resultSchema = z.object({
  id: z.number().optional(),
  score: z.number().min(0, "Score must be non-negative."),
  studentId: z.string().cuid("Invalid Student ID format."),
  examId: z.number().optional().nullable(),
  assignmentId: z.number().optional().nullable(),
  schoolId: z.string().cuid().optional(),
}).refine(data => data.examId || data.assignmentId, {
  message: "Result must be linked to an exam or an assignment.",
  path: ["examId"],
});

export type ResultSchema = z.infer<typeof resultSchema>;

export const announcementSchema = z.object({
  id: z.coerce.number().optional(),
  title: z.string().min(1, { message: "Title is required!" }),
  content: z.string().min(1, { message: "Content is required!" }),
  classId: z.coerce.number().optional(),
});

export type AnnouncementSchema = z.infer<typeof announcementSchema>;

export const eventSchema = z.object({
  id: z.number().optional(),
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().optional().nullable(),
  startTime: z.coerce.date({ message: "Start time is required" }),
  endTime: z.coerce.date({ message: "End time is required" }),
  classId: z.coerce.number().optional().nullable(), // Optional class ID
  roomId: z.coerce.number().optional().nullable(), // NEW: Optional Room ID
  schoolId: z.string().optional(), // schoolId will be added by the action based on auth
});

export type EventSchema = z.infer<typeof eventSchema>;

export const attendanceSchema = z.object({
  id: z.coerce.number().optional(),
  date: z.coerce.date({ message: "Date is required!" }),
  lessonId: z.coerce.number({ message: "Lesson is required!" }),
  studentAttendance: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum(["PRESENT", "ABSENT", "LATE"]),
    })
  ),
});

export type AttendanceSchema = z.infer<typeof attendanceSchema>;

export const GradeSchema = z.object({
  id: z.number().optional(),
  level: z.string()
    .min(1, { message: "Grade level is required." })
    .max(50, { message: "Grade level must be 50 characters or less." }),
});

export type GradeSchema = z.infer<typeof GradeSchema>;

// Schema for Sign-In form
export const signInSchema = z.object({
  identifier: z.string().min(1, { message: "Email or Username is required." }),
  password: z.string().min(1, { message: "Password is required." }),
});

export type SignInSchema = z.infer<typeof signInSchema>;

export const teacherAvailabilitySchema = z.object({
  id: z.string().cuid().optional(),
  dayOfWeek: z.nativeEnum(Day),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"),
  notes: z.string().max(500).optional(),
}).refine(data => {
  // Ensure endTime is after startTime
  const start = new Date(`1970-01-01T${data.startTime}:00`);
  const end = new Date(`1970-01-01T${data.endTime}:00`);
  return end > start;
}, {
  message: "End time must be after start time.",
  path: ["endTime"],
});

export type TeacherAvailabilitySchema = z.infer<typeof teacherAvailabilitySchema>;

export const adminSchema = z.object({
  id: z.string().cuid({ message: "Invalid Admin ID format." }),
  username: z.string().min(1, "Username is required.").optional(),
  name: z.string().min(1, "First name is required.").max(50).optional().or(z.literal('')),
  surname: z.string().min(1, "Last name is required.").max(50).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  img: z.string().url("Invalid URL format.").optional().or(z.literal('')),
  email: z.string().email("Invalid email format.").optional().or(z.literal('')),
  password: z.string().min(8, "Password must be at least 8 characters.").optional().or(z.literal('')),
  confirmPassword: z.string().optional().or(z.literal('')),
}).refine(data => {
  if (data.password && data.password !== "" && data.password !== data.confirmPassword) {
    return false;
  }
  return true;
}, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

// NEW Enums for Zod (matching Prisma enums)
export const ScheduleChangeTypeZod = z.enum(["TIME_CHANGE", "SWAP"]);
export const RequestStatusZod = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELED"]);

// NEW Zod Schema for ScheduleChangeRequest using discriminated union
const scheduleChangeRequestBaseSchema = z.object({
  id: z.string().cuid().optional(),
  lessonId: z.coerce.number({ required_error: "Lesson selection is required." }),
  reason: z.string().min(1, { message: "Reason for the request is required." }).max(1000, "Reason is too long (max 1000 characters)."),
});

const timeChangeSpecificSchema = z.object({
  requestedChangeType: z.literal(ScheduleChangeTypeZod.Enum.TIME_CHANGE),
  proposedStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Start time is required and must be in HH:MM format."),
  proposedEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "End time is required and must be in HH:MM format."),
  proposedDay: z.nativeEnum(Day, { required_error: "Proposed day is required for a time change." }),
  proposedSwapTeacherId: z.string().cuid({ message: "Invalid teacher ID format." }).optional().nullable(), // Should be null/undefined for TIME_CHANGE
});

const swapSpecificSchema = z.object({
  requestedChangeType: z.literal(ScheduleChangeTypeZod.Enum.SWAP),
  // For SWAP, time/day fields are not used and should not fail validation if empty/not present.
  proposedStartTime: z.string().optional().nullable(), // No strict regex, allows empty, null, or undefined.
  proposedEndTime: z.string().optional().nullable(),   // No strict regex, allows empty, null, or undefined.
  proposedDay: z.nativeEnum(Day).optional().nullable(), // No strict enum check if not provided for SWAP.
  proposedSwapTeacherId: z.string().cuid({ message: "A teacher to swap with must be selected." }),
});

export const scheduleChangeRequestSchema = z.discriminatedUnion("requestedChangeType", [
  scheduleChangeRequestBaseSchema.merge(timeChangeSpecificSchema),
  scheduleChangeRequestBaseSchema.merge(swapSpecificSchema)
]).superRefine((data, ctx) => {
  // SuperRefine is now only for cross-field logic not covered by the discriminated union types themselves.
  if (data.requestedChangeType === ScheduleChangeTypeZod.Enum.TIME_CHANGE) {
    // This check assumes proposedStartTime and proposedEndTime are valid time strings due to timeChangeSpecificSchema.
    // The individual field requirements (non-empty, regex) are handled by timeChangeSpecificSchema.
    if (data.proposedStartTime && data.proposedEndTime && data.proposedEndTime <= data.proposedStartTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Proposed end time must be after proposed start time.",
        path: ["proposedEndTime"], // Path for the error message
      });
    }
  }
  // For SWAP type, the requirement for proposedSwapTeacherId is handled by swapSpecificSchema.
  // No additional cross-field validation needed here for SWAP with current fields.
});

export type ScheduleChangeRequestSchema = z.infer<typeof scheduleChangeRequestSchema>;

export const roomSchema = z.object({
  id: z.number().optional(), // For updates, not directly part of form for create
  name: z.string().min(1, { message: "Room name is required" }),
  type: z.string().optional().nullable().default(null), // Ensure default is null if not provided
  capacity: z.coerce.number().int().positive().optional().nullable().default(null), // coerce, ensure int, positive
  description: z.string().optional().nullable().default(null),
  // schoolId will be passed to the action directly or derived from authUser, not usually part of the main form body from client unless necessary.
  // However, RoomForm sends it, so the action should expect it if formSchema is used for parsing action payload.
  schoolId: z.string({ required_error: "School ID is required" }).min(1, "School ID is required"),
});

export type RoomSchema = z.infer<typeof roomSchema>;
