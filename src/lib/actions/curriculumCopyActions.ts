'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getServerUser } from '@/lib/auth';
import { userHasSchoolAccess } from '@/lib/schoolAccess';
import type { CurriculumBookRole } from '@prisma/client';
import { buildExistingTargetKeySet, partitionCurriculumCopyRows } from '@/lib/domain/curriculumCopyPreview';

const CopyBetweenYearsSchema = z.object({
  schoolId: z.string().cuid({ message: 'Valid School ID is required.' }),
  sourceAcademicYearId: z.string().cuid({ message: 'Valid source academic year is required.' }),
  targetAcademicYearId: z.string().cuid({ message: 'Valid target academic year is required.' }),
});

async function loadSourceCurricula(schoolId: string, sourceAcademicYearId: string) {
  return prisma.curriculum.findMany({
    where: { schoolId, academicYearId: sourceAcademicYearId },
    include: {
      books: { orderBy: { sortOrder: 'asc' } },
      grade: { select: { id: true, level: true } },
      subject: { select: { id: true, name: true } },
    },
    orderBy: [{ grade: { level: 'asc' } }, { subject: { name: 'asc' } }],
  });
}

async function assertSchoolYears(
  schoolId: string,
  sourceAcademicYearId: string,
  targetAcademicYearId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [src, tgt] = await Promise.all([
    prisma.academicYear.findFirst({
      where: { id: sourceAcademicYearId, schoolId },
      select: { id: true, isArchived: true },
    }),
    prisma.academicYear.findFirst({
      where: { id: targetAcademicYearId, schoolId, isArchived: false },
      select: { id: true },
    }),
  ]);
  if (!src) {
    return { ok: false, message: 'Source academic year not found for this school.' };
  }
  if (!tgt) {
    return { ok: false, message: 'Target academic year not found, is archived, or does not belong to this school.' };
  }
  return { ok: true };
}

export type CopyPreviewSkippedItem = {
  gradeId: number;
  subjectId: number;
  gradeLevel: string;
  subjectName: string;
  reason: 'duplicate';
};

export type CopyPreviewCreateItem = {
  gradeId: number;
  subjectId: number;
  gradeLevel: string;
  subjectName: string;
  bookCount: number;
};

export async function previewCopyCurriculumFromYearAction(params: z.infer<typeof CopyBetweenYearsSchema>) {
  const parsed = CopyBetweenYearsSchema.safeParse(params);
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false as const, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { schoolId, sourceAcademicYearId, targetAcademicYearId } = parsed.data;

  if (sourceAcademicYearId === targetAcademicYearId) {
    return { success: false as const, message: 'Source and target academic year must be different.' };
  }

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false as const, message: 'Unauthorized.' };
  }

  const yearsOk = await assertSchoolYears(schoolId, sourceAcademicYearId, targetAcademicYearId);
  if (!yearsOk.ok) {
    return { success: false as const, message: yearsOk.message };
  }

  const [sourceRows, existingTarget] = await Promise.all([
    loadSourceCurricula(schoolId, sourceAcademicYearId),
    prisma.curriculum.findMany({
      where: { schoolId, academicYearId: targetAcademicYearId },
      select: { gradeId: true, subjectId: true },
    }),
  ]);

  const existingKeys = buildExistingTargetKeySet(existingTarget);
  const { toCreate, skipped } = partitionCurriculumCopyRows(sourceRows, existingKeys);

  const toCreateSummary: CopyPreviewCreateItem[] = toCreate.map((row) => ({
    gradeId: row.gradeId,
    subjectId: row.subjectId,
    gradeLevel: row.grade.level,
    subjectName: row.subject.name,
    bookCount: row.books.length,
  }));

  const skippedSummary: CopyPreviewSkippedItem[] = skipped.map((row) => ({
    gradeId: row.gradeId,
    subjectId: row.subjectId,
    gradeLevel: row.grade.level,
    subjectName: row.subject.name,
    reason: 'duplicate' as const,
  }));

  return {
    success: true as const,
    sourceCount: sourceRows.length,
    toCreate: toCreateSummary,
    skipped: skippedSummary,
    willCreateCount: toCreate.length,
    skippedCount: skipped.length,
  };
}

export async function applyCopyCurriculumFromYearAction(params: z.infer<typeof CopyBetweenYearsSchema>) {
  const parsed = CopyBetweenYearsSchema.safeParse(params);
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false as const, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { schoolId, sourceAcademicYearId, targetAcademicYearId } = parsed.data;

  if (sourceAcademicYearId === targetAcademicYearId) {
    return { success: false as const, message: 'Source and target academic year must be different.' };
  }

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false as const, message: 'Unauthorized.' };
  }

  const yearsOk = await assertSchoolYears(schoolId, sourceAcademicYearId, targetAcademicYearId);
  if (!yearsOk.ok) {
    return { success: false as const, message: yearsOk.message };
  }

  const sourceRows = await loadSourceCurricula(schoolId, sourceAcademicYearId);
  const existingTarget = await prisma.curriculum.findMany({
    where: { schoolId, academicYearId: targetAcademicYearId },
    select: { gradeId: true, subjectId: true },
  });
  const existingKeys = buildExistingTargetKeySet(existingTarget);
  const { toCreate } = partitionCurriculumCopyRows(sourceRows, existingKeys);

  if (toCreate.length === 0) {
    return {
      success: true as const,
      message: 'Nothing to copy — all source rows already exist for the target year.',
      createdCount: 0,
    };
  }

  let createdCount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const src of toCreate) {
        const created = await tx.curriculum.create({
          data: {
            schoolId,
            academicYearId: targetAcademicYearId,
            gradeId: src.gradeId,
            subjectId: src.subjectId,
            description: src.description,
            textbook: src.textbook,
            syllabusOutline: src.syllabusOutline,
            syllabusUrl: src.syllabusUrl,
            coefficient: src.coefficient,
            periodsPerWeek: src.periodsPerWeek,
          },
        });
        createdCount += 1;
        if (src.books.length > 0) {
          await tx.curriculumBook.createMany({
            data: src.books.map((b, index) => ({
              curriculumId: created.id,
              sortOrder: b.sortOrder ?? index,
              title: b.title,
              authors: b.authors,
              isbn: b.isbn,
              publisher: b.publisher,
              edition: b.edition,
              role: b.role as CurriculumBookRole,
              notes: b.notes,
            })),
          });
        }
      }
    });
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === 'P2002') {
      return {
        success: false as const,
        message: 'Copy failed: a duplicate grade/subject row was created concurrently. Refresh and try again.',
      };
    }
    return {
      success: false as const,
      message: error instanceof Error ? error.message : 'Failed to copy curriculum.',
    };
  }

  revalidatePath(`/schools/${schoolId}/academic-years/${targetAcademicYearId}/curriculum`);

  return {
    success: true as const,
    message: `Copied ${createdCount} curriculum row(s) from the source year.`,
    createdCount,
  };
}
