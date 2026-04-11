-- AlterTable
ALTER TABLE "School" ADD COLUMN "country" TEXT,
ADD COLUMN "teachingSystem" TEXT;

-- AlterTable
ALTER TABLE "AcademicYear" ADD COLUMN "catalogTemplateId" TEXT,
ADD COLUMN "catalogTemplateVersion" TEXT,
ADD COLUMN "catalogInstalledAt" TIMESTAMP(3);
