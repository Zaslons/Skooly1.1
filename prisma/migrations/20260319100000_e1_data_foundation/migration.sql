-- E1 data foundation: exam hardening + assignment due lesson linkage.

ALTER TABLE "Exam"
ADD COLUMN IF NOT EXISTS "examPeriodId" TEXT,
ADD COLUMN IF NOT EXISTS "termId" TEXT,
ADD COLUMN IF NOT EXISTS "examTemplateId" TEXT,
ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Assignment"
ADD COLUMN IF NOT EXISTS "dueLessonId" INTEGER;

ALTER TABLE "Lesson"
ADD COLUMN IF NOT EXISTS "periodId" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Period'
  ) THEN
    ALTER TABLE "Lesson"
    ADD CONSTRAINT "Lesson_periodId_fkey"
    FOREIGN KEY ("periodId")
    REFERENCES "Period"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Term'
  ) THEN
    ALTER TABLE "Exam"
    ADD CONSTRAINT "Exam_termId_fkey"
    FOREIGN KEY ("termId")
    REFERENCES "Term"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ExamTemplate'
  ) THEN
    ALTER TABLE "Exam"
    ADD CONSTRAINT "Exam_examTemplateId_fkey"
    FOREIGN KEY ("examTemplateId")
    REFERENCES "ExamTemplate"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'SchoolCalendarException'
  ) THEN
    ALTER TABLE "Exam"
    ADD CONSTRAINT "Exam_examPeriodId_fkey"
    FOREIGN KEY ("examPeriodId")
    REFERENCES "SchoolCalendarException"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "Assignment"
ADD CONSTRAINT "Assignment_dueLessonId_fkey"
FOREIGN KEY ("dueLessonId")
REFERENCES "Lesson"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Exam_schoolId_startTime_endTime_idx"
ON "Exam"("schoolId", "startTime", "endTime");

CREATE INDEX IF NOT EXISTS "Exam_schoolId_lessonId_startTime_endTime_idx"
ON "Exam"("schoolId", "lessonId", "startTime", "endTime");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Exam'
      AND column_name = 'termId'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Exam_schoolId_termId_startTime_idx"
    ON "Exam"("schoolId", "termId", "startTime");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "Exam_examPeriodId_idx"
ON "Exam"("examPeriodId");

CREATE INDEX IF NOT EXISTS "Assignment_schoolId_dueDate_idx"
ON "Assignment"("schoolId", "dueDate");

CREATE INDEX IF NOT EXISTS "Assignment_schoolId_dueLessonId_idx"
ON "Assignment"("schoolId", "dueLessonId");

CREATE INDEX IF NOT EXISTS "Assignment_schoolId_lessonId_idx"
ON "Assignment"("schoolId", "lessonId");

CREATE INDEX IF NOT EXISTS "Lesson_schoolId_day_teacherId_startTime_endTime_idx"
ON "Lesson"("schoolId", "day", "teacherId", "startTime", "endTime");

CREATE INDEX IF NOT EXISTS "Lesson_schoolId_day_classId_startTime_endTime_idx"
ON "Lesson"("schoolId", "day", "classId", "startTime", "endTime");

CREATE INDEX IF NOT EXISTS "Lesson_schoolId_day_roomId_startTime_endTime_idx"
ON "Lesson"("schoolId", "day", "roomId", "startTime", "endTime");

CREATE INDEX IF NOT EXISTS "Lesson_periodId_idx"
ON "Lesson"("periodId");

-- Backfill dueLessonId from legacy lessonId where possible.
UPDATE "Assignment"
SET "dueLessonId" = "lessonId"
WHERE "dueLessonId" IS NULL
  AND "lessonId" IS NOT NULL;
