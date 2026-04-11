-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "endPeriodId" TEXT;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_endPeriodId_fkey" FOREIGN KEY ("endPeriodId") REFERENCES "Period"("id") ON DELETE SET NULL ON UPDATE CASCADE;
