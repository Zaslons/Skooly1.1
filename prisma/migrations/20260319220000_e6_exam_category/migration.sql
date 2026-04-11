-- CreateEnum
CREATE TYPE "ExamCategory" AS ENUM ('COURSE_EXAM', 'POP_QUIZ');

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN "examCategory" "ExamCategory" NOT NULL DEFAULT 'COURSE_EXAM';
