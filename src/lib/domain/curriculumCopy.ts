import type { CurriculumBookRole } from '@prisma/client';

/** Minimal row shape for copy preview/apply (from Prisma include). */
export type CurriculumRowForCopy = {
  id: string;
  gradeId: number;
  subjectId: number;
  description: string | null;
  textbook: string | null;
  syllabusOutline: string | null;
  syllabusUrl: string | null;
  coefficient: number;
  periodsPerWeek: number | null;
  grade: { level: string };
  subject: { name: string };
  books: Array<{
    sortOrder: number;
    title: string;
    authors: string | null;
    isbn: string | null;
    publisher: string | null;
    edition: string | null;
    role: CurriculumBookRole;
    notes: string | null;
  }>;
};

export function gradeSubjectKey(gradeId: number, subjectId: number): string {
  return `${gradeId}:${subjectId}`;
}

export function partitionCurriculumRowsForCopy(
  sourceRows: CurriculumRowForCopy[],
  targetGradeSubjectKeys: ReadonlySet<string>
): {
  toCreate: CurriculumRowForCopy[];
  skipped: Array<{
    gradeId: number;
    subjectId: number;
    gradeLevel: string;
    subjectName: string;
    reason: 'already_exists';
  }>;
} {
  const toCreate: CurriculumRowForCopy[] = [];
  const skipped: Array<{
    gradeId: number;
    subjectId: number;
    gradeLevel: string;
    subjectName: string;
    reason: 'already_exists';
  }> = [];

  for (const row of sourceRows) {
    const k = gradeSubjectKey(row.gradeId, row.subjectId);
    if (targetGradeSubjectKeys.has(k)) {
      skipped.push({
        gradeId: row.gradeId,
        subjectId: row.subjectId,
        gradeLevel: row.grade.level,
        subjectName: row.subject.name,
        reason: 'already_exists',
      });
    } else {
      toCreate.push(row);
    }
  }

  return { toCreate, skipped };
}
