/*
  Warnings:

  - Added the required column `startDate` to the `Assignment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "maxStudents" INTEGER,
ADD COLUMN     "maxTeachers" INTEGER;
