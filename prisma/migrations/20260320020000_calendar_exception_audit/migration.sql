-- CreateTable
CREATE TABLE "CalendarExceptionAudit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "exceptionId" TEXT,
    "actorAuthId" TEXT,
    "operation" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarExceptionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarExceptionAudit_schoolId_termId_createdAt_idx" ON "CalendarExceptionAudit"("schoolId", "termId", "createdAt");

-- CreateIndex
CREATE INDEX "CalendarExceptionAudit_exceptionId_createdAt_idx" ON "CalendarExceptionAudit"("exceptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "CalendarExceptionAudit" ADD CONSTRAINT "CalendarExceptionAudit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarExceptionAudit" ADD CONSTRAINT "CalendarExceptionAudit_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarExceptionAudit" ADD CONSTRAINT "CalendarExceptionAudit_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "SchoolCalendarException"("id") ON DELETE SET NULL ON UPDATE CASCADE;
