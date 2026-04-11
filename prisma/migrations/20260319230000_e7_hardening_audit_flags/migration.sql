-- AlterTable
ALTER TABLE "School" ADD COLUMN "schedulingPipelineEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "RecurringExamCommitLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "examsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "summaryJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExamCommitLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonSessionOverrideAudit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "lessonSessionId" INTEGER NOT NULL,
    "actorAuthId" TEXT,
    "patchJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonSessionOverrideAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringExamCommitLog_schoolId_termId_createdAt_idx" ON "RecurringExamCommitLog"("schoolId", "termId", "createdAt");

-- CreateIndex
CREATE INDEX "LessonSessionOverrideAudit_schoolId_createdAt_idx" ON "LessonSessionOverrideAudit"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "LessonSessionOverrideAudit_lessonSessionId_idx" ON "LessonSessionOverrideAudit"("lessonSessionId");

-- AddForeignKey
ALTER TABLE "RecurringExamCommitLog" ADD CONSTRAINT "RecurringExamCommitLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExamCommitLog" ADD CONSTRAINT "RecurringExamCommitLog_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSessionOverrideAudit" ADD CONSTRAINT "LessonSessionOverrideAudit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSessionOverrideAudit" ADD CONSTRAINT "LessonSessionOverrideAudit_lessonSessionId_fkey" FOREIGN KEY ("lessonSessionId") REFERENCES "LessonSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
