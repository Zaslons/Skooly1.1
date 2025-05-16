'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers'; // For getCurrentUser
import { verifyToken, AuthUser } from '@/lib/auth'; // For getCurrentUser

// Helper to get current authenticated user (can be shared or redefined)
async function getCurrentUser(): Promise<AuthUser | null> {
  const tokenCookie = cookies().get('auth_token');
  if (!tokenCookie) return null;
  return verifyToken(tokenCookie.value);
}

// Zod schema for creating a curriculum entry
const CreateCurriculumSchema = z.object({
  schoolId: z.string().cuid({ message: "Valid School ID is required." }),
  academicYearId: z.string().cuid({ message: "Valid Academic Year ID is required." }),
  gradeId: z.preprocess((val) => parseInt(String(val), 10), z.number({ required_error: "Grade ID is required." }).int().positive({ message: "Grade ID must be a positive number." })),
  subjectId: z.preprocess((val) => parseInt(String(val), 10), z.number({ required_error: "Subject ID is required." }).int().positive({ message: "Subject ID must be a positive number." })),
  description: z.string().optional().nullable(),
  textbook: z.string().optional().nullable(),
});

// Data type expected by the action from the client
export interface CreateCurriculumData {
  schoolId: string;
  academicYearId: string;
  gradeId: string; // Still string here, as it comes from form value, Zod will parse
  subjectId: string; // Still string here, Zod will parse
  description?: string;
  textbook?: string;
}

export async function createCurriculumAction(data: CreateCurriculumData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.schoolId !== data.schoolId || currentUser.role !== 'admin') {
    throw new Error("Unauthorized: You do not have permission to create curriculum entries for this school.");
  }

  // Validate input data - Zod will parse gradeId and subjectId to numbers here
  const validatedFields = CreateCurriculumSchema.safeParse(data);
  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    throw new Error(`Validation failed: ${firstError || 'Invalid input.'}`);
  }

  // After validation, gradeId and subjectId from validatedFields.data are numbers
  const { schoolId, academicYearId, gradeId, subjectId, description, textbook } = validatedFields.data;

  try {
    // Validate that AY, Grade, and Subject belong to the School
    const [academicYear, grade, subject] = await Promise.all([
      prisma.academicYear.findUnique({ where: { id: academicYearId, schoolId: schoolId, isArchived: false } }),
      prisma.grade.findUnique({ where: { id: gradeId, schoolId: schoolId } }), // gradeId is now number
      prisma.subject.findUnique({ where: { id: subjectId, schoolId: schoolId } }) // subjectId is now number
    ]);

    if (!academicYear) throw new Error("Academic Year not found, is archived, or does not belong to this school.");
    if (!grade) throw new Error("Grade not found or does not belong to this school.");
    if (!subject) throw new Error("Subject not found or does not belong to this school.");

    const existingEntry = await prisma.curriculum.findUnique({
      where: {
        academicYearId_gradeId_subjectId: { 
          academicYearId: academicYearId,
          gradeId: gradeId, // gradeId is now number
          subjectId: subjectId, // subjectId is now number
        }
      }
    });

    if (existingEntry) {
      throw new Error("This subject is already assigned to this grade for the selected academic year.");
    }

    const newCurriculumEntry = await prisma.curriculum.create({
      data: {
        schoolId,
        academicYearId,
        gradeId, // gradeId is now number
        subjectId, // subjectId is now number
        description: description || null,
        textbook: textbook || null,
      },
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);

    return {
      success: true,
      message: "Curriculum entry created successfully!",
      curriculum: newCurriculumEntry,
    };

  } catch (error: any) {
    console.error("Error creating curriculum entry:", error);
    if (error.code === 'P2002') { 
        throw new Error("This subject is already assigned to this grade for the selected academic year (unique constraint).");
    }
    throw new Error(error.message || "Failed to create curriculum entry.");
  }
}

// Zod schema for updating a curriculum entry
const UpdateCurriculumSchema = z.object({
  description: z.string().optional().nullable(),
  textbook: z.string().optional().nullable(),
});

export interface UpdateCurriculumData {
  description?: string;
  textbook?: string;
}

export async function updateCurriculumAction(curriculumId: string, data: UpdateCurriculumData) {
  const validatedFields = UpdateCurriculumSchema.safeParse(data);
  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    throw new Error(`Validation failed: ${firstError || 'Invalid input.'}`);
  }

  const { description, textbook } = validatedFields.data;
  if (typeof description === 'undefined' && typeof textbook === 'undefined') {
    throw new Error("No fields provided for update. To clear a field, pass an empty string or null.");
  }

  const curriculumToUpdate = await prisma.curriculum.findUnique({
    where: { id: curriculumId },
    select: { schoolId: true, academicYearId: true } 
  });

  if (!curriculumToUpdate) {
    throw new Error("Curriculum entry not found.");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.schoolId !== curriculumToUpdate.schoolId || currentUser.role !== 'admin') {
    throw new Error("Unauthorized: You do not have permission to update this curriculum entry.");
  }
  
  const updateData: { description?: string | null, textbook?: string | null } = {};
  if (typeof description !== 'undefined') {
    updateData.description = description;
  }
  if (typeof textbook !== 'undefined') {
    updateData.textbook = textbook;
  }

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
    console.error("Error updating curriculum entry:", error);
    if (error.code === 'P2025') { 
      throw new Error("Curriculum entry not found for update (P2025).");
    }
    throw new Error(error.message || "Failed to update curriculum entry.");
  }
}

// Zod schema for deleting a curriculum entry - mainly for schoolId for auth
const DeleteCurriculumParamsSchema = z.object({
  curriculumId: z.string().cuid({ message: "Valid Curriculum ID is required." }),
  schoolId: z.string().cuid({ message: "Valid School ID is required for authorization." }),
  academicYearId: z.string().cuid({ message: "Valid Academic Year ID is required for revalidation." }),
});

export async function deleteCurriculumAction(params: { curriculumId: string; schoolId: string; academicYearId: string }) {
  const validationResult = DeleteCurriculumParamsSchema.safeParse(params);
  if (!validationResult.success) {
    const firstError = Object.values(validationResult.error.flatten().fieldErrors)[0]?.[0];
    throw new Error(`Validation failed: ${firstError || 'Invalid input.'}`);
  }

  const { curriculumId, schoolId, academicYearId } = validationResult.data;

  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.schoolId !== schoolId || currentUser.role !== 'admin') {
    throw new Error("Unauthorized: You do not have permission to delete curriculum entries for this school.");
  }

  try {
    // Verify curriculum entry exists and belongs to the school
    const curriculumToDelete = await prisma.curriculum.findUnique({
      where: { id: curriculumId },
      select: { schoolId: true, academicYearId: true }, // Select academicYearId for revalidation too
    });

    if (!curriculumToDelete) {
      throw new Error("Curriculum entry not found.");
    }

    if (curriculumToDelete.schoolId !== schoolId) {
      // This is an extra check, current user's schoolId should already match.
      throw new Error("Curriculum entry does not belong to the specified school.");
    }

    await prisma.curriculum.delete({
      where: { id: curriculumId },
    });

    // Revalidate the path for the specific academic year's curriculum page
    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);

    return {
      success: true,
      message: "Curriculum entry deleted successfully!",
    };

  } catch (error: any) {
    console.error("Error deleting curriculum entry:", error);
    if (error.code === 'P2025') { // Record to delete not found
        throw new Error("Curriculum entry not found for deletion (P2025).");
    }
    throw new Error(error.message || "Failed to delete curriculum entry.");
  }
} 