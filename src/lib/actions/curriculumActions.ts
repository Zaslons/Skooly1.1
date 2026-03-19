'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getServerUser } from '@/lib/auth';

const CreateCurriculumSchema = z.object({
  schoolId: z.string().cuid({ message: "Valid School ID is required." }),
  academicYearId: z.string().cuid({ message: "Valid Academic Year ID is required." }),
  gradeId: z.preprocess((val) => parseInt(String(val), 10), z.number({ required_error: "Grade ID is required." }).int().positive({ message: "Grade ID must be a positive number." })),
  subjectId: z.preprocess((val) => parseInt(String(val), 10), z.number({ required_error: "Subject ID is required." }).int().positive({ message: "Subject ID must be a positive number." })),
  description: z.string().optional().nullable(),
  textbook: z.string().optional().nullable(),
  coefficient: z.coerce.number().min(0.1, { message: "Coefficient must be at least 0.1" }).default(1.0),
});

export interface CreateCurriculumData {
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  subjectId: string;
  description?: string;
  textbook?: string;
  coefficient?: number;
}

export async function createCurriculumAction(data: CreateCurriculumData) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.schoolId !== data.schoolId || currentUser.role !== 'admin') {
    return { success: false, message: "Unauthorized: You do not have permission to create curriculum entries for this school." };
  }

  const validatedFields = CreateCurriculumSchema.safeParse(data);
  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { schoolId, academicYearId, gradeId, subjectId, description, textbook, coefficient } = validatedFields.data;

  try {
    const [academicYear, grade, subject] = await Promise.all([
      prisma.academicYear.findUnique({ where: { id: academicYearId, schoolId, isArchived: false } }),
      prisma.grade.findUnique({ where: { id: gradeId, schoolId } }),
      prisma.subject.findUnique({ where: { id: subjectId, schoolId } })
    ]);

    if (!academicYear) return { success: false, message: "Academic Year not found, is archived, or does not belong to this school." };
    if (!grade) return { success: false, message: "Grade not found or does not belong to this school." };
    if (!subject) return { success: false, message: "Subject not found or does not belong to this school." };

    const existingEntry = await prisma.curriculum.findUnique({
      where: {
        academicYearId_gradeId_subjectId: { academicYearId, gradeId, subjectId }
      }
    });

    if (existingEntry) {
      return { success: false, message: "This subject is already assigned to this grade for the selected academic year." };
    }

    const newCurriculumEntry = await prisma.curriculum.create({
      data: {
        schoolId,
        academicYearId,
        gradeId,
        subjectId,
        description: description || null,
        textbook: textbook || null,
        coefficient,
      },
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);

    return {
      success: true,
      message: "Curriculum entry created successfully!",
      curriculum: newCurriculumEntry,
    };
  } catch (error: any) {
    if (error.code === 'P2002') { 
      return { success: false, message: "This subject is already assigned to this grade for the selected academic year." };
    }
    return { success: false, message: error.message || "Failed to create curriculum entry." };
  }
}

const UpdateCurriculumSchema = z.object({
  description: z.string().optional().nullable(),
  textbook: z.string().optional().nullable(),
  coefficient: z.coerce.number().min(0.1, { message: "Coefficient must be at least 0.1" }).optional(),
});

export interface UpdateCurriculumData {
  description?: string;
  textbook?: string;
  coefficient?: number;
}

export async function updateCurriculumAction(curriculumId: string, data: UpdateCurriculumData) {
  const validatedFields = UpdateCurriculumSchema.safeParse(data);
  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { description, textbook, coefficient } = validatedFields.data;
  if (typeof description === 'undefined' && typeof textbook === 'undefined' && typeof coefficient === 'undefined') {
    return { success: false, message: "No fields provided for update." };
  }

  const curriculumToUpdate = await prisma.curriculum.findUnique({
    where: { id: curriculumId },
    select: { schoolId: true, academicYearId: true } 
  });

  if (!curriculumToUpdate) {
    return { success: false, message: "Curriculum entry not found." };
  }

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.schoolId !== curriculumToUpdate.schoolId || currentUser.role !== 'admin') {
    return { success: false, message: "Unauthorized: You do not have permission to update this curriculum entry." };
  }
  
  const updateData: { description?: string | null; textbook?: string | null; coefficient?: number } = {};
  if (typeof description !== 'undefined') updateData.description = description;
  if (typeof textbook !== 'undefined') updateData.textbook = textbook;
  if (typeof coefficient !== 'undefined') updateData.coefficient = coefficient;

  try {
    const updatedCurriculum = await prisma.curriculum.update({
      where: { id: curriculumId },
      data: updateData,
    });

    revalidatePath(`/schools/${curriculumToUpdate.schoolId}/academic-years/${curriculumToUpdate.academicYearId}/curriculum`);

    return {
      success: true,
      message: "Curriculum entry updated successfully!",
      curriculum: updatedCurriculum,
    };
  } catch (error: any) {
    if (error.code === 'P2025') { 
      return { success: false, message: "Curriculum entry not found for update." };
    }
    return { success: false, message: error.message || "Failed to update curriculum entry." };
  }
}

const DeleteCurriculumParamsSchema = z.object({
  curriculumId: z.string().cuid({ message: "Valid Curriculum ID is required." }),
  schoolId: z.string().cuid({ message: "Valid School ID is required for authorization." }),
  academicYearId: z.string().cuid({ message: "Valid Academic Year ID is required for revalidation." }),
});

export async function deleteCurriculumAction(params: { curriculumId: string; schoolId: string; academicYearId: string }) {
  const validationResult = DeleteCurriculumParamsSchema.safeParse(params);
  if (!validationResult.success) {
    const firstError = Object.values(validationResult.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { curriculumId, schoolId, academicYearId } = validationResult.data;

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.schoolId !== schoolId || currentUser.role !== 'admin') {
    return { success: false, message: "Unauthorized: You do not have permission to delete curriculum entries for this school." };
  }

  try {
    const curriculumToDelete = await prisma.curriculum.findUnique({
      where: { id: curriculumId },
      select: { schoolId: true, academicYearId: true },
    });

    if (!curriculumToDelete) {
      return { success: false, message: "Curriculum entry not found." };
    }

    if (curriculumToDelete.schoolId !== schoolId) {
      return { success: false, message: "Curriculum entry does not belong to the specified school." };
    }

    await prisma.curriculum.delete({ where: { id: curriculumId } });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);

    return { success: true, message: "Curriculum entry deleted successfully!" };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: false, message: "Curriculum entry not found for deletion." };
    }
    return { success: false, message: error.message || "Failed to delete curriculum entry." };
  }
}
