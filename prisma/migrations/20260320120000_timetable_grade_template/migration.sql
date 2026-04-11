-- CreateTable
CREATE TABLE "TimetableGradeTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "gradeId" INTEGER NOT NULL,
    "rowsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableGradeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimetableGradeTemplate_schoolId_idx" ON "TimetableGradeTemplate"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableGradeTemplate_schoolId_gradeId_key" ON "TimetableGradeTemplate"("schoolId", "gradeId");

-- AddForeignKey
ALTER TABLE "TimetableGradeTemplate" ADD CONSTRAINT "TimetableGradeTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableGradeTemplate" ADD CONSTRAINT "TimetableGradeTemplate_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
