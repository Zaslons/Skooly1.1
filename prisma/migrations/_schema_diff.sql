-- CreateEnum
CREATE TYPE "CalendarExceptionType" AS ENUM ('HOLIDAY', 'BREAK', 'EXAM_PERIOD');

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_lessonId_fkey";

-- AlterTable
ALTER TABLE "Attendance" DROP COLUMN "excused",
DROP COLUMN "lessonId",
DROP COLUMN "reason",
ADD COLUMN     "lessonSessionId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "examTemplateId" TEXT,
ADD COLUMN     "termId" TEXT;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "periodId" TEXT;

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
CREATE INDEX "Exam_termId_idx" ON "Exam"("termId");

-- CreateIndex
CREATE INDEX "Exam_examTemplateId_idx" ON "Exam"("examTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_examTemplateId_startTime_key" ON "Exam"("examTemplateId", "startTime");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_examTemplateId_fkey" FOREIGN KEY ("examTemplateId") REFERENCES "ExamTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_lessonSessionId_fkey" FOREIGN KEY ("lessonSessionId") REFERENCES "LessonSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
