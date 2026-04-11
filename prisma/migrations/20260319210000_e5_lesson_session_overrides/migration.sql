-- E5: instance-level overrides on LessonSession (does not mutate Lesson template)

CREATE TYPE "LessonSessionStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

ALTER TABLE "LessonSession"
ADD COLUMN IF NOT EXISTS "status" "LessonSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN IF NOT EXISTS "substituteTeacherId" TEXT,
ADD COLUMN IF NOT EXISTS "overrideRoomId" INTEGER,
ADD COLUMN IF NOT EXISTS "instanceNotes" TEXT,
ADD COLUMN IF NOT EXISTS "lastOverrideReason" TEXT,
ADD COLUMN IF NOT EXISTS "lastOverrideAt" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Teacher') THEN
    ALTER TABLE "LessonSession"
    ADD CONSTRAINT "LessonSession_substituteTeacherId_fkey"
    FOREIGN KEY ("substituteTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Room') THEN
    ALTER TABLE "LessonSession"
    ADD CONSTRAINT "LessonSession_overrideRoomId_fkey"
    FOREIGN KEY ("overrideRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LessonSession_schoolId_status_sessionDate_idx"
ON "LessonSession"("schoolId", "status", "sessionDate");
