-- CreateEnum
CREATE TYPE "LessonDeliveryMode" AS ENUM ('IN_PERSON', 'ONLINE');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "deliveryMode" "LessonDeliveryMode" NOT NULL DEFAULT 'IN_PERSON';

-- AlterTable
ALTER TABLE "LessonSession" ADD COLUMN "deliveryMode" "LessonDeliveryMode" NOT NULL DEFAULT 'IN_PERSON';
