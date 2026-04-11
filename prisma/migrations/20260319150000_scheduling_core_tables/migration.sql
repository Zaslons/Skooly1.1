-- Scheduling core tables: Term, Period, SchoolCalendarException, ExamTemplate, LessonSession.
-- These models existed in Prisma but were missing from earlier migrations; later steps (E5, E7)
-- ALTER/REFER them and require the base tables to exist on a fresh `migrate reset`.

-- CalendarExceptionType (SchoolCalendarException)
DO $$ BEGIN
  CREATE TYPE "CalendarExceptionType" AS ENUM ('HOLIDAY', 'BREAK', 'EXAM_PERIOD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Term
CREATE TABLE IF NOT EXISTS "Term" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "Term_schoolId_academicYearId_name_key"
ON "Term"("schoolId", "academicYearId", "name");

CREATE INDEX IF NOT EXISTS "Term_schoolId_isActive_idx"
ON "Term"("schoolId", "isActive");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Term_schoolId_fkey') THEN
    ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Term_academicYearId_fkey') THEN
    ALTER TABLE "Term" ADD CONSTRAINT "Term_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Period
CREATE TABLE IF NOT EXISTS "Period" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "Period_schoolId_name_key"
ON "Period"("schoolId", "name");

CREATE INDEX IF NOT EXISTS "Period_schoolId_order_idx"
ON "Period"("schoolId", "order");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Period_schoolId_fkey') THEN
    ALTER TABLE "Period" ADD CONSTRAINT "Period_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Lesson.periodId → Period (column added in e1; FK skipped if Period was missing)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Lesson' AND column_name = 'periodId'
  ) AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lesson_periodId_fkey') THEN
    ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- SchoolCalendarException
CREATE TABLE IF NOT EXISTS "SchoolCalendarException" (
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

CREATE INDEX IF NOT EXISTS "SchoolCalendarException_termId_type_idx"
ON "SchoolCalendarException"("termId", "type");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SchoolCalendarException_schoolId_fkey') THEN
    ALTER TABLE "SchoolCalendarException" ADD CONSTRAINT "SchoolCalendarException_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SchoolCalendarException_termId_fkey') THEN
    ALTER TABLE "SchoolCalendarException" ADD CONSTRAINT "SchoolCalendarException_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ExamTemplate
CREATE TABLE IF NOT EXISTS "ExamTemplate" (
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

CREATE INDEX IF NOT EXISTS "ExamTemplate_termId_day_classId_idx"
ON "ExamTemplate"("termId", "day", "classId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamTemplate_schoolId_fkey') THEN
    ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamTemplate_termId_fkey') THEN
    ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamTemplate_classId_fkey') THEN
    ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamTemplate_subjectId_fkey') THEN
    ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamTemplate_teacherId_fkey') THEN
    ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamTemplate_roomId_fkey') THEN
    ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Exam FKs to Term / ExamTemplate (columns from e1; FKs skipped when tables were missing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Exam_termId_fkey') THEN
    ALTER TABLE "Exam" ADD CONSTRAINT "Exam_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Exam_examTemplateId_fkey') THEN
    ALTER TABLE "Exam" ADD CONSTRAINT "Exam_examTemplateId_fkey"
    FOREIGN KEY ("examTemplateId") REFERENCES "ExamTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- LessonSession (E5 adds status / override columns)
CREATE TABLE IF NOT EXISTS "LessonSession" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "LessonSession_templateLessonId_sessionDate_key"
ON "LessonSession"("templateLessonId", "sessionDate");

CREATE INDEX IF NOT EXISTS "LessonSession_termId_sessionDate_idx"
ON "LessonSession"("termId", "sessionDate");

CREATE INDEX IF NOT EXISTS "LessonSession_schoolId_classId_sessionDate_idx"
ON "LessonSession"("schoolId", "classId", "sessionDate");

CREATE INDEX IF NOT EXISTS "LessonSession_schoolId_teacherId_sessionDate_idx"
ON "LessonSession"("schoolId", "teacherId", "sessionDate");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonSession_termId_fkey') THEN
    ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonSession_schoolId_fkey') THEN
    ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonSession_templateLessonId_fkey') THEN
    ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_templateLessonId_fkey"
    FOREIGN KEY ("templateLessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonSession_subjectId_fkey') THEN
    ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonSession_classId_fkey') THEN
    ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonSession_teacherId_fkey') THEN
    ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonSession_roomId_fkey') THEN
    ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
