-- CreateEnum
CREATE TYPE "CalendarExceptionType" AS ENUM ('HOLIDAY', 'BREAK', 'EXAM_PERIOD');

-- CreateEnum
CREATE TYPE "UserSex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Day" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'PAST_DUE', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'UNPAID');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ENROLLED', 'PROMOTED', 'REPEATED', 'WITHDRAWN', 'COMPLETED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "JoinCodeType" AS ENUM ('CLASS_STUDENT', 'TEACHER_INVITE', 'PARENT_LINK');

-- CreateEnum
CREATE TYPE "ScheduleChangeType" AS ENUM ('TIME_CHANGE', 'SWAP');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gradingScale" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "stripeCustomerId" TEXT,
    "activeAcademicYearId" TEXT,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auth" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "schoolId" TEXT,
    "accountType" "AccountType" NOT NULL DEFAULT 'SCHOOL_ADMIN',
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "surname" TEXT,
    "phone" TEXT,
    "img" TEXT,
    "authId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT NOT NULL,
    "img" TEXT,
    "bloodType" TEXT NOT NULL,
    "sex" "UserSex" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "birthday" TIMESTAMP(3) NOT NULL,
    "authId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "classId" INTEGER,
    "gradeId" INTEGER,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT NOT NULL,
    "img" TEXT,
    "bloodType" TEXT NOT NULL,
    "sex" "UserSex" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "birthday" TIMESTAMP(3) NOT NULL,
    "authId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parent" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "Parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "gradeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "day" "Day" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "periodId" TEXT,
    "schoolId" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "teacherId" TEXT NOT NULL,
    "roomId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonSession" (
    "id" SERIAL NOT NULL,
    "termId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "templateLessonId" INTEGER NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "day" "Day" NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "teacherId" TEXT NOT NULL,
    "roomId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "title" TEXT,
    "day" "Day" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "classId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "teacherId" TEXT,
    "roomId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "schoolId" TEXT NOT NULL,
    "lessonId" INTEGER,
    "termId" TEXT,
    "examTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "schoolId" TEXT NOT NULL,
    "lessonId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" SERIAL NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "comments" TEXT,
    "submissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "examId" INTEGER,
    "assignmentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonSessionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" INTEGER,
    "roomId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" INTEGER,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAdmin" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "SystemAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "features" TEXT[],
    "maxStudents" INTEGER,
    "maxTeachers" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolSubscription" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subscriptionPlanId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextBillingDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "order" INTEGER NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolCalendarException" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CalendarExceptionType" NOT NULL DEFAULT 'HOLIDAY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolCalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curriculum" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "schoolId" TEXT NOT NULL,
    "description" TEXT,
    "textbook" TEXT,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Curriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentEnrollmentHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" INTEGER NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "enrollmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departureDate" TIMESTAMP(3),
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentEnrollmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherAvailability" (
    "id" TEXT NOT NULL,
    "dayOfWeek" "Day" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL,
    "notes" TEXT,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleChangeRequest" (
    "id" TEXT NOT NULL,
    "requestingTeacherId" TEXT NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "requestedChangeType" "ScheduleChangeType" NOT NULL,
    "proposedStartTime" TIMESTAMP(3),
    "proposedEndTime" TIMESTAMP(3),
    "proposedDay" "Day",
    "proposedSwapTeacherId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingScale" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeBand" (
    "id" TEXT NOT NULL,
    "gradingScaleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "abbreviation" TEXT,
    "minPercentage" DOUBLE PRECISION NOT NULL,
    "maxPercentage" DOUBLE PRECISION NOT NULL,
    "gpaEquivalent" DOUBLE PRECISION,
    "color" TEXT,
    "isPassing" BOOLEAN NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "GradeBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRules" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeId" INTEGER,
    "passingThreshold" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "minimumOverallAverage" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "maxFailedSubjects" INTEGER NOT NULL DEFAULT 2,
    "minimumAttendance" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "borderlineMargin" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JoinCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "JoinCodeType" NOT NULL,
    "classId" INTEGER,
    "studentId" TEXT,
    "email" TEXT,
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JoinCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMembership" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" TEXT,
    "teacherId" TEXT,
    "studentId" TEXT,
    "parentId" TEXT,

    CONSTRAINT "SchoolMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "capacity" INTEGER,
    "description" TEXT,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SubjectToTeacher" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "School_name_key" ON "School"("name");

-- CreateIndex
CREATE UNIQUE INDEX "School_stripeCustomerId_key" ON "School"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "School_activeAcademicYearId_key" ON "School"("activeAcademicYearId");

-- CreateIndex
CREATE INDEX "School_name_idx" ON "School"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Auth_username_key" ON "Auth"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Auth_email_key" ON "Auth"("email");

-- CreateIndex
CREATE INDEX "Auth_email_idx" ON "Auth"("email");

-- CreateIndex
CREATE INDEX "Auth_role_idx" ON "Auth"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_authId_key" ON "Admin"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_username_key" ON "Student"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Student_phone_key" ON "Student"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Student_authId_key" ON "Student"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_username_key" ON "Teacher"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_email_key" ON "Teacher"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_phone_key" ON "Teacher"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_authId_key" ON "Teacher"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_username_key" ON "Parent"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_email_key" ON "Parent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_authId_key" ON "Parent"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_level_schoolId_key" ON "Grade"("level", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_name_schoolId_academicYearId_key" ON "Class"("name", "schoolId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_schoolId_key" ON "Subject"("name", "schoolId");

-- CreateIndex
CREATE INDEX "LessonSession_termId_sessionDate_idx" ON "LessonSession"("termId", "sessionDate");

-- CreateIndex
CREATE INDEX "LessonSession_schoolId_classId_sessionDate_idx" ON "LessonSession"("schoolId", "classId", "sessionDate");

-- CreateIndex
CREATE INDEX "LessonSession_schoolId_teacherId_sessionDate_idx" ON "LessonSession"("schoolId", "teacherId", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "LessonSession_templateLessonId_sessionDate_key" ON "LessonSession"("templateLessonId", "sessionDate");

-- CreateIndex
CREATE INDEX "ExamTemplate_termId_day_classId_idx" ON "ExamTemplate"("termId", "day", "classId");

-- CreateIndex
CREATE INDEX "Exam_termId_idx" ON "Exam"("termId");

-- CreateIndex
CREATE INDEX "Exam_examTemplateId_idx" ON "Exam"("examTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_examTemplateId_startTime_key" ON "Exam"("examTemplateId", "startTime");

-- CreateIndex
CREATE INDEX "Result_studentId_idx" ON "Result"("studentId");

-- CreateIndex
CREATE INDEX "Result_examId_idx" ON "Result"("examId");

-- CreateIndex
CREATE INDEX "Result_assignmentId_idx" ON "Result"("assignmentId");

-- CreateIndex
CREATE INDEX "Attendance_studentId_date_idx" ON "Attendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "Attendance_academicYearId_idx" ON "Attendance"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemAdmin_authId_key" ON "SystemAdmin"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_stripePriceId_key" ON "SubscriptionPlan"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSubscription_stripeSubscriptionId_key" ON "SchoolSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "SchoolSubscription_schoolId_idx" ON "SchoolSubscription"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolSubscription_stripeSubscriptionId_idx" ON "SchoolSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "AcademicYear_schoolId_isActive_idx" ON "AcademicYear"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_schoolId_name_key" ON "AcademicYear"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Term_schoolId_isActive_idx" ON "Term"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Term_schoolId_academicYearId_name_key" ON "Term"("schoolId", "academicYearId", "name");

-- CreateIndex
CREATE INDEX "Period_schoolId_order_idx" ON "Period"("schoolId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Period_schoolId_name_key" ON "Period"("schoolId", "name");

-- CreateIndex
CREATE INDEX "SchoolCalendarException_termId_type_idx" ON "SchoolCalendarException"("termId", "type");

-- CreateIndex
CREATE INDEX "Curriculum_schoolId_idx" ON "Curriculum"("schoolId");

-- CreateIndex
CREATE INDEX "Curriculum_academicYearId_idx" ON "Curriculum"("academicYearId");

-- CreateIndex
CREATE INDEX "Curriculum_gradeId_idx" ON "Curriculum"("gradeId");

-- CreateIndex
CREATE INDEX "Curriculum_subjectId_idx" ON "Curriculum"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_academicYearId_gradeId_subjectId_key" ON "Curriculum"("academicYearId", "gradeId", "subjectId");

-- CreateIndex
CREATE INDEX "StudentEnrollmentHistory_studentId_idx" ON "StudentEnrollmentHistory"("studentId");

-- CreateIndex
CREATE INDEX "StudentEnrollmentHistory_classId_idx" ON "StudentEnrollmentHistory"("classId");

-- CreateIndex
CREATE INDEX "StudentEnrollmentHistory_academicYearId_idx" ON "StudentEnrollmentHistory"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentEnrollmentHistory_studentId_classId_key" ON "StudentEnrollmentHistory"("studentId", "classId");

-- CreateIndex
CREATE INDEX "TeacherAvailability_teacherId_idx" ON "TeacherAvailability"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherAvailability_schoolId_idx" ON "TeacherAvailability"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAvailability_teacherId_dayOfWeek_startTime_schoolId_key" ON "TeacherAvailability"("teacherId", "dayOfWeek", "startTime", "schoolId");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_requestingTeacherId_idx" ON "ScheduleChangeRequest"("requestingTeacherId");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_lessonId_idx" ON "ScheduleChangeRequest"("lessonId");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_proposedSwapTeacherId_idx" ON "ScheduleChangeRequest"("proposedSwapTeacherId");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_schoolId_idx" ON "ScheduleChangeRequest"("schoolId");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_status_idx" ON "ScheduleChangeRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GradingScale_schoolId_name_key" ON "GradingScale"("schoolId", "name");

-- CreateIndex
CREATE INDEX "GradeBand_gradingScaleId_idx" ON "GradeBand"("gradingScaleId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_gradingScaleId_label_key" ON "GradeBand"("gradingScaleId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRules_schoolId_academicYearId_gradeId_key" ON "PromotionRules"("schoolId", "academicYearId", "gradeId");

-- CreateIndex
CREATE UNIQUE INDEX "JoinCode_code_key" ON "JoinCode"("code");

-- CreateIndex
CREATE INDEX "JoinCode_code_idx" ON "JoinCode"("code");

-- CreateIndex
CREATE INDEX "JoinCode_schoolId_idx" ON "JoinCode"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_adminId_key" ON "SchoolMembership"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_teacherId_key" ON "SchoolMembership"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_studentId_key" ON "SchoolMembership"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_parentId_key" ON "SchoolMembership"("parentId");

-- CreateIndex
CREATE INDEX "SchoolMembership_authId_idx" ON "SchoolMembership"("authId");

-- CreateIndex
CREATE INDEX "SchoolMembership_schoolId_idx" ON "SchoolMembership"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_authId_schoolId_role_key" ON "SchoolMembership"("authId", "schoolId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Room_name_schoolId_key" ON "Room"("name", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "_SubjectToTeacher_AB_unique" ON "_SubjectToTeacher"("A", "B");

-- CreateIndex
CREATE INDEX "_SubjectToTeacher_B_index" ON "_SubjectToTeacher"("B");

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_activeAcademicYearId_fkey" FOREIGN KEY ("activeAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auth" ADD CONSTRAINT "Auth_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parent" ADD CONSTRAINT "Parent_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parent" ADD CONSTRAINT "Parent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_templateLessonId_fkey" FOREIGN KEY ("templateLessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_examTemplateId_fkey" FOREIGN KEY ("examTemplateId") REFERENCES "ExamTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_lessonSessionId_fkey" FOREIGN KEY ("lessonSessionId") REFERENCES "LessonSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAdmin" ADD CONSTRAINT "SystemAdmin_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSubscription" ADD CONSTRAINT "SchoolSubscription_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSubscription" ADD CONSTRAINT "SchoolSubscription_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Period" ADD CONSTRAINT "Period_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCalendarException" ADD CONSTRAINT "SchoolCalendarException_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCalendarException" ADD CONSTRAINT "SchoolCalendarException_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentHistory" ADD CONSTRAINT "StudentEnrollmentHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentHistory" ADD CONSTRAINT "StudentEnrollmentHistory_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentHistory" ADD CONSTRAINT "StudentEnrollmentHistory_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAvailability" ADD CONSTRAINT "TeacherAvailability_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAvailability" ADD CONSTRAINT "TeacherAvailability_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_requestingTeacherId_fkey" FOREIGN KEY ("requestingTeacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_proposedSwapTeacherId_fkey" FOREIGN KEY ("proposedSwapTeacherId") REFERENCES "Teacher"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingScale" ADD CONSTRAINT "GradingScale_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeBand" ADD CONSTRAINT "GradeBand_gradingScaleId_fkey" FOREIGN KEY ("gradingScaleId") REFERENCES "GradingScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRules" ADD CONSTRAINT "PromotionRules_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRules" ADD CONSTRAINT "PromotionRules_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRules" ADD CONSTRAINT "PromotionRules_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinCode" ADD CONSTRAINT "JoinCode_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinCode" ADD CONSTRAINT "JoinCode_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubjectToTeacher" ADD CONSTRAINT "_SubjectToTeacher_A_fkey" FOREIGN KEY ("A") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubjectToTeacher" ADD CONSTRAINT "_SubjectToTeacher_B_fkey" FOREIGN KEY ("B") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
