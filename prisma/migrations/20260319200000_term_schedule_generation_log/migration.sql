-- E4: audit logs for term schedule generation (dry-run + commit).

CREATE TABLE IF NOT EXISTS "TermScheduleGenerationLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeGradeId" INTEGER,
    "scopeClassId" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "summaryJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermScheduleGenerationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TermScheduleGenerationLog_schoolId_termId_createdAt_idx"
ON "TermScheduleGenerationLog"("schoolId", "termId", "createdAt");

CREATE INDEX IF NOT EXISTS "TermScheduleGenerationLog_schoolId_idempotencyKey_mode_idx"
ON "TermScheduleGenerationLog"("schoolId", "idempotencyKey", "mode");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'School') THEN
    ALTER TABLE "TermScheduleGenerationLog"
    ADD CONSTRAINT "TermScheduleGenerationLog_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Term') THEN
    ALTER TABLE "TermScheduleGenerationLog"
    ADD CONSTRAINT "TermScheduleGenerationLog_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
