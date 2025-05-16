-- CreateEnum
CREATE TYPE "ScheduleChangeType" AS ENUM ('TIME_CHANGE', 'SWAP');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- AlterTable
ALTER TABLE "TeacherAvailability" ALTER COLUMN "isAvailable" DROP DEFAULT;

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

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_requestingTeacherId_fkey" FOREIGN KEY ("requestingTeacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_proposedSwapTeacherId_fkey" FOREIGN KEY ("proposedSwapTeacherId") REFERENCES "Teacher"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
