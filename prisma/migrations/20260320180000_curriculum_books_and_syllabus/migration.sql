-- CreateEnum
CREATE TYPE "CurriculumBookRole" AS ENUM ('primary', 'supplementary', 'workbook', 'reader', 'teacher', 'digital', 'other');

-- AlterTable
ALTER TABLE "Curriculum" ADD COLUMN "syllabusOutline" TEXT,
ADD COLUMN "syllabusUrl" TEXT;

-- CreateTable
CREATE TABLE "CurriculumBook" (
    "id" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "isbn" TEXT,
    "publisher" TEXT,
    "edition" TEXT,
    "role" "CurriculumBookRole" NOT NULL DEFAULT 'primary',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumBook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurriculumBook_curriculumId_idx" ON "CurriculumBook"("curriculumId");

-- AddForeignKey
ALTER TABLE "CurriculumBook" ADD CONSTRAINT "CurriculumBook_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
