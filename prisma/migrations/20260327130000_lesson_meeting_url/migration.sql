-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "meetingUrl" TEXT,
ADD COLUMN "meetingLabel" TEXT;

-- AlterTable
ALTER TABLE "LessonSession" ADD COLUMN "meetingUrl" TEXT,
ADD COLUMN "meetingLabel" TEXT;
