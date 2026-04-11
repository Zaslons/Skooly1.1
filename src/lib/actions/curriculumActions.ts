'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getServerUser } from '@/lib/auth';
import { userHasSchoolAccess } from '@/lib/schoolAccess';
import type { CurriculumBookRole } from '@prisma/client';
import {
  createPeriodsPerWeekSchema,
  createSyllabusUrlSchema,
  CurriculumBookInputSchema,
  initialBooksSchema,
  updatePeriodsPerWeekSchema,
  updateSyllabusUrlSchema,
} from '@/lib/validation/curriculumSchemas';

const CreateCurriculumSchema = z.object({
  schoolId: z.string().cuid({ message: 'Valid School ID is required.' }),
  academicYearId: z.string().cuid({ message: 'Valid Academic Year ID is required.' }),
  gradeId: z.preprocess((val) => parseInt(String(val), 10), z.number({ required_error: 'Grade ID is required.' }).int().positive({ message: 'Grade ID must be a positive number.' })),
  subjectId: z.preprocess((val) => parseInt(String(val), 10), z.number({ required_error: 'Subject ID is required.' }).int().positive({ message: 'Subject ID must be a positive number.' })),
  description: z.string().optional().nullable(),
  syllabusOutline: z.string().optional().nullable(),
  syllabusUrl: createSyllabusUrlSchema,
  periodsPerWeek: createPeriodsPerWeekSchema,
  coefficient: z.coerce.number().min(0.1, { message: 'Coefficient must be at least 0.1' }).default(1.0),
  initialBooks: initialBooksSchema,
});

export interface CreateCurriculumData {
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  subjectId: string;
  description?: string;
  syllabusOutline?: string | null;
  syllabusUrl?: string | null;
  periodsPerWeek?: number | null;
  coefficient?: number;
  initialBooks?: z.infer<typeof CurriculumBookInputSchema>[];
}

export async function createCurriculumAction(data: CreateCurriculumData) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.schoolId !== data.schoolId || currentUser.role !== 'admin') {
    return { success: false, message: 'Unauthorized: You do not have permission to create curriculum entries for this school.' };
  }

  const validatedFields = CreateCurriculumSchema.safeParse(data);
  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const {
    schoolId,
    academicYearId,
    gradeId,
    subjectId,
    description,
    syllabusOutline,
    syllabusUrl,
    periodsPerWeek,
    coefficient,
    initialBooks,
  } = validatedFields.data;

  try {
    const [academicYear, grade, subject] = await Promise.all([
      prisma.academicYear.findUnique({ where: { id: academicYearId, schoolId, isArchived: false } }),
      prisma.grade.findUnique({ where: { id: gradeId, schoolId } }),
      prisma.subject.findUnique({ where: { id: subjectId, schoolId } }),
    ]);

    if (!academicYear) return { success: false, message: 'Academic Year not found, is archived, or does not belong to this school.' };
    if (!grade) return { success: false, message: 'Grade not found or does not belong to this school.' };
    if (!subject) return { success: false, message: 'Subject not found or does not belong to this school.' };

    const existingEntry = await prisma.curriculum.findUnique({
      where: {
        academicYearId_gradeId_subjectId: { academicYearId, gradeId, subjectId },
      },
    });

    if (existingEntry) {
      return { success: false, message: 'This subject is already assigned to this grade for the selected academic year.' };
    }

    const newCurriculumEntry = await prisma.$transaction(async (tx) => {
      const created = await tx.curriculum.create({
        data: {
          schoolId,
          academicYearId,
          gradeId,
          subjectId,
          description: description || null,
          textbook: null,
          syllabusOutline: syllabusOutline ?? null,
          syllabusUrl: syllabusUrl ?? null,
          periodsPerWeek: periodsPerWeek ?? null,
          coefficient,
        },
      });

      if (initialBooks?.length) {
        await tx.curriculumBook.createMany({
          data: initialBooks.map((b, index) => ({
            curriculumId: created.id,
            sortOrder: index,
            title: b.title,
            authors: b.authors ?? null,
            isbn: b.isbn ?? null,
            publisher: b.publisher ?? null,
            edition: b.edition ?? null,
            role: b.role as CurriculumBookRole,
            notes: b.notes ?? null,
          })),
        });
      }

      return created;
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);

    return {
      success: true,
      message: 'Curriculum entry created successfully!',
      curriculum: newCurriculumEntry,
    };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false, message: 'This subject is already assigned to this grade for the selected academic year.' };
    }
    return { success: false, message: error.message || 'Failed to create curriculum entry.' };
  }
}

const UpdateCurriculumSchema = z.object({
  description: z.string().optional().nullable(),
  /** Only clearing allowed — non-empty values rejected (use CurriculumBook). */
  textbook: z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      if (typeof v === 'string' && v.trim() === '') return null;
      return v;
    },
    z.union([z.string(), z.null()]).optional()
  ).superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'The legacy textbook field cannot be set to new text. Add teaching materials under Books.',
    });
  }),
  syllabusOutline: z.string().optional().nullable(),
  syllabusUrl: updateSyllabusUrlSchema,
  periodsPerWeek: updatePeriodsPerWeekSchema,
  coefficient: z.coerce.number().min(0.1, { message: 'Coefficient must be at least 0.1' }).optional(),
});

export interface UpdateCurriculumData {
  description?: string;
  /** Only omit, null, or clear (empty); non-empty strings are rejected. */
  textbook?: string | null;
  syllabusOutline?: string | null;
  syllabusUrl?: string | null;
  periodsPerWeek?: number | null;
  coefficient?: number;
}

export async function updateCurriculumAction(curriculumId: string, data: UpdateCurriculumData) {
  const validatedFields = UpdateCurriculumSchema.safeParse(data);
  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { description, textbook, syllabusOutline, syllabusUrl, periodsPerWeek, coefficient } = validatedFields.data;
  if (
    typeof description === 'undefined' &&
    typeof textbook === 'undefined' &&
    typeof syllabusOutline === 'undefined' &&
    typeof syllabusUrl === 'undefined' &&
    typeof periodsPerWeek === 'undefined' &&
    typeof coefficient === 'undefined'
  ) {
    return { success: false, message: 'No fields provided for update.' };
  }

  const curriculumToUpdate = await prisma.curriculum.findUnique({
    where: { id: curriculumId },
    select: { schoolId: true, academicYearId: true },
  });

  if (!curriculumToUpdate) {
    return { success: false, message: 'Curriculum entry not found.' };
  }

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.schoolId !== curriculumToUpdate.schoolId || currentUser.role !== 'admin') {
    return { success: false, message: 'Unauthorized: You do not have permission to update this curriculum entry.' };
  }

  const updateData: {
    description?: string | null;
    textbook?: string | null;
    syllabusOutline?: string | null;
    syllabusUrl?: string | null;
    periodsPerWeek?: number | null;
    coefficient?: number;
  } = {};
  if (typeof description !== 'undefined') updateData.description = description;
  if (typeof textbook !== 'undefined') updateData.textbook = textbook;
  if (typeof syllabusOutline !== 'undefined') updateData.syllabusOutline = syllabusOutline;
  if (typeof syllabusUrl !== 'undefined') updateData.syllabusUrl = syllabusUrl;
  if (typeof periodsPerWeek !== 'undefined') updateData.periodsPerWeek = periodsPerWeek;
  if (typeof coefficient !== 'undefined') updateData.coefficient = coefficient;

  try {
    const updatedCurriculum = await prisma.curriculum.update({
      where: { id: curriculumId },
      data: updateData,
    });

    revalidatePath(`/schools/${curriculumToUpdate.schoolId}/academic-years/${curriculumToUpdate.academicYearId}/curriculum`);

    return {
      success: true,
      message: 'Curriculum entry updated successfully!',
      curriculum: updatedCurriculum,
    };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: false, message: 'Curriculum entry not found for update.' };
    }
    return { success: false, message: error.message || 'Failed to update curriculum entry.' };
  }
}

const DeleteCurriculumParamsSchema = z.object({
  curriculumId: z.string().cuid({ message: 'Valid Curriculum ID is required.' }),
  schoolId: z.string().cuid({ message: 'Valid School ID is required for authorization.' }),
  academicYearId: z.string().cuid({ message: 'Valid Academic Year ID is required for revalidation.' }),
});

export async function deleteCurriculumAction(params: { curriculumId: string; schoolId: string; academicYearId: string }) {
  const validationResult = DeleteCurriculumParamsSchema.safeParse(params);
  if (!validationResult.success) {
    const firstError = Object.values(validationResult.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { curriculumId, schoolId, academicYearId } = validationResult.data;

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: 'Unauthorized: You do not have permission to delete curriculum entries for this school.' };
  }

  try {
    const curriculumToDelete = await prisma.curriculum.findUnique({
      where: { id: curriculumId },
      select: { schoolId: true, academicYearId: true },
    });

    if (!curriculumToDelete) {
      return { success: false, message: 'Curriculum entry not found.' };
    }

    if (curriculumToDelete.schoolId !== schoolId) {
      return { success: false, message: 'Curriculum entry does not belong to the specified school.' };
    }

    await prisma.curriculum.delete({ where: { id: curriculumId } });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);

    return { success: true, message: 'Curriculum entry deleted successfully!' };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: false, message: 'Curriculum entry not found for deletion.' };
    }
    return { success: false, message: error.message || 'Failed to delete curriculum entry.' };
  }
}

const CreateCurriculumBookSchema = CurriculumBookInputSchema.extend({
  curriculumId: z.string().cuid({ message: 'Valid curriculum ID is required.' }),
  schoolId: z.string().cuid({ message: 'Valid School ID is required.' }),
  academicYearId: z.string().cuid({ message: 'Valid Academic Year ID is required.' }),
  sortOrder: z.number().int().min(0).optional(),
});

export type CreateCurriculumBookData = z.infer<typeof CreateCurriculumBookSchema>;

export async function createCurriculumBookAction(data: CreateCurriculumBookData) {
  const validated = CreateCurriculumBookSchema.safeParse(data);
  if (!validated.success) {
    const firstError = Object.values(validated.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { curriculumId, schoolId, academicYearId, sortOrder, ...bookFields } = validated.data;

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: 'Unauthorized: You do not have permission to add books for this school.' };
  }

  const curriculum = await prisma.curriculum.findUnique({
    where: { id: curriculumId },
    select: { schoolId: true, academicYearId: true },
  });

  if (!curriculum || curriculum.schoolId !== schoolId || curriculum.academicYearId !== academicYearId) {
    return { success: false, message: 'Curriculum not found or does not belong to this academic year.' };
  }

  try {
    const agg = await prisma.curriculumBook.aggregate({
      where: { curriculumId },
      _max: { sortOrder: true },
    });
    const nextOrder = typeof sortOrder === 'number' ? sortOrder : (agg._max.sortOrder ?? -1) + 1;

    const book = await prisma.curriculumBook.create({
      data: {
        curriculumId,
        sortOrder: nextOrder,
        title: bookFields.title,
        authors: bookFields.authors ?? null,
        isbn: bookFields.isbn ?? null,
        publisher: bookFields.publisher ?? null,
        edition: bookFields.edition ?? null,
        role: bookFields.role as CurriculumBookRole,
        notes: bookFields.notes ?? null,
      },
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);

    return { success: true, message: 'Book added.', book };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to add book.' };
  }
}

const UpdateCurriculumBookSchema = z.object({
  bookId: z.string().cuid(),
  schoolId: z.string().cuid(),
  academicYearId: z.string().cuid(),
  title: z.string().min(1).optional(),
  authors: z.string().optional().nullable(),
  isbn: z.string().optional().nullable(),
  publisher: z.string().optional().nullable(),
  edition: z.string().optional().nullable(),
  role: z.enum(['primary', 'supplementary', 'workbook', 'reader', 'teacher', 'digital', 'other']).optional(),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateCurriculumBookData = z.infer<typeof UpdateCurriculumBookSchema>;

export async function updateCurriculumBookAction(data: UpdateCurriculumBookData) {
  const validated = UpdateCurriculumBookSchema.safeParse(data);
  if (!validated.success) {
    const firstError = Object.values(validated.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { bookId, schoolId, academicYearId, ...patch } = validated.data;

  if (Object.keys(patch).length === 0) {
    return { success: false, message: 'No fields provided for update.' };
  }

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: 'Unauthorized: You do not have permission to update this book.' };
  }

  const existing = await prisma.curriculumBook.findUnique({
    where: { id: bookId },
    include: { curriculum: { select: { schoolId: true, academicYearId: true } } },
  });

  if (!existing || existing.curriculum.schoolId !== schoolId || existing.curriculum.academicYearId !== academicYearId) {
    return { success: false, message: 'Book not found.' };
  }

  try {
    const book = await prisma.curriculumBook.update({
      where: { id: bookId },
      data: {
        ...(typeof patch.title !== 'undefined' ? { title: patch.title } : {}),
        ...(typeof patch.authors !== 'undefined' ? { authors: patch.authors } : {}),
        ...(typeof patch.isbn !== 'undefined' ? { isbn: patch.isbn } : {}),
        ...(typeof patch.publisher !== 'undefined' ? { publisher: patch.publisher } : {}),
        ...(typeof patch.edition !== 'undefined' ? { edition: patch.edition } : {}),
        ...(typeof patch.role !== 'undefined' ? { role: patch.role as CurriculumBookRole } : {}),
        ...(typeof patch.notes !== 'undefined' ? { notes: patch.notes } : {}),
        ...(typeof patch.sortOrder !== 'undefined' ? { sortOrder: patch.sortOrder } : {}),
      },
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);

    return { success: true, message: 'Book updated.', book };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: false, message: 'Book not found for update.' };
    }
    return { success: false, message: error.message || 'Failed to update book.' };
  }
}

const DeleteCurriculumBookSchema = z.object({
  bookId: z.string().cuid(),
  schoolId: z.string().cuid(),
  academicYearId: z.string().cuid(),
});

export async function deleteCurriculumBookAction(params: z.infer<typeof DeleteCurriculumBookSchema>) {
  const validated = DeleteCurriculumBookSchema.safeParse(params);
  if (!validated.success) {
    const firstError = Object.values(validated.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { bookId, schoolId, academicYearId } = validated.data;

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: 'Unauthorized: You do not have permission to delete this book.' };
  }

  const existing = await prisma.curriculumBook.findUnique({
    where: { id: bookId },
    include: { curriculum: { select: { schoolId: true, academicYearId: true } } },
  });

  if (!existing || existing.curriculum.schoolId !== schoolId || existing.curriculum.academicYearId !== academicYearId) {
    return { success: false, message: 'Book not found.' };
  }

  try {
    await prisma.curriculumBook.delete({ where: { id: bookId } });
    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);
    return { success: true, message: 'Book removed.' };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: false, message: 'Book not found for deletion.' };
    }
    return { success: false, message: error.message || 'Failed to delete book.' };
  }
}
