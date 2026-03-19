/*
  Warnings:

  - Added the required column `updatedAt` to the `Announcement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Assignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `status` on the `Attendance` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `Class` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Exam` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Grade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Lesson` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Result` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Subject` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ENROLLED', 'PROMOTED', 'REPEATED', 'WITHDRAWN', 'COMPLETED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "JoinCodeType" AS ENUM ('CLASS_STUDENT', 'TEACHER_INVITE', 'PARENT_LINK');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "AttendanceStatus" NOT NULL;

-- AlterTable
ALTER TABLE "Auth" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'SCHOOL_ADMIN',
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "displayName" TEXT;

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Curriculum" ADD COLUMN     "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Result" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "gradingScale" DOUBLE PRECISION NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "StudentEnrollmentHistory" ADD COLUMN     "status" "EnrollmentStatus" NOT NULL DEFAULT 'ENROLLED';

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "GradingScale" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeBand" (
    "id" TEXT NOT NULL,
    "gradingScaleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "abbreviation" TEXT,
    "minPercentage" DOUBLE PRECISION NOT NULL,
    "maxPercentage" DOUBLE PRECISION NOT NULL,
    "gpaEquivalent" DOUBLE PRECISION,
    "color" TEXT,
    "isPassing" BOOLEAN NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "GradeBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRules" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeId" INTEGER,
    "passingThreshold" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "minimumOverallAverage" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "maxFailedSubjects" INTEGER NOT NULL DEFAULT 2,
    "minimumAttendance" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "borderlineMargin" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JoinCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "JoinCodeType" NOT NULL,
    "classId" INTEGER,
    "studentId" TEXT,
    "email" TEXT,
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JoinCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMembership" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" TEXT,
    "teacherId" TEXT,
    "studentId" TEXT,
    "parentId" TEXT,

    CONSTRAINT "SchoolMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradingScale_schoolId_name_key" ON "GradingScale"("schoolId", "name");

-- CreateIndex
CREATE INDEX "GradeBand_gradingScaleId_idx" ON "GradeBand"("gradingScaleId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_gradingScaleId_label_key" ON "GradeBand"("gradingScaleId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRules_schoolId_academicYearId_gradeId_key" ON "PromotionRules"("schoolId", "academicYearId", "gradeId");

-- CreateIndex
CREATE UNIQUE INDEX "JoinCode_code_key" ON "JoinCode"("code");

-- CreateIndex
CREATE INDEX "JoinCode_code_idx" ON "JoinCode"("code");

-- CreateIndex
CREATE INDEX "JoinCode_schoolId_idx" ON "JoinCode"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_adminId_key" ON "SchoolMembership"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_teacherId_key" ON "SchoolMembership"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_studentId_key" ON "SchoolMembership"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_parentId_key" ON "SchoolMembership"("parentId");

-- CreateIndex
CREATE INDEX "SchoolMembership_authId_idx" ON "SchoolMembership"("authId");

-- CreateIndex
CREATE INDEX "SchoolMembership_schoolId_idx" ON "SchoolMembership"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_authId_schoolId_role_key" ON "SchoolMembership"("authId", "schoolId", "role");

-- AddForeignKey
ALTER TABLE "GradingScale" ADD CONSTRAINT "GradingScale_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeBand" ADD CONSTRAINT "GradeBand_gradingScaleId_fkey" FOREIGN KEY ("gradingScaleId") REFERENCES "GradingScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRules" ADD CONSTRAINT "PromotionRules_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRules" ADD CONSTRAINT "PromotionRules_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRules" ADD CONSTRAINT "PromotionRules_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinCode" ADD CONSTRAINT "JoinCode_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinCode" ADD CONSTRAINT "JoinCode_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
