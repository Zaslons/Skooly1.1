/*
  Warnings:

  - Added the required column `academicYearId` to the `Attendance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "academicYearId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Attendance_academicYearId_idx" ON "Attendance"("academicYearId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
