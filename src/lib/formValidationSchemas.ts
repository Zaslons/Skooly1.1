import { z } from "zod";
import { Day } from "@prisma/client";

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
  endTime: z.coerce.date({ message: "End time is required!" }),
  lessonId: z.coerce.number({ message: "Lesson is required!" }),
});

export type ExamSchema = z.infer<typeof examSchema>;

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
  roomId: z.coerce.number().optional().nullable(),
});

export type LessonSchema = z.infer<typeof lessonSchema>;

export const assignmentSchema = z.object({
  id: z.coerce.number().optional(),
  title: z.string().min(1, { message: "Title is required!" }),
  startDate: z.coerce.date({ message: "Start date is required!" }),
  dueDate: z.coerce.date({ message: "Due date is required!" }),
  lessonId: z.coerce.number({ message: "Lesson is required!" }),
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
      status: z.enum(["Present", "Absent", "Late"]),
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

export const schoolSchema = z.object({
  // ... existing code ...
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
