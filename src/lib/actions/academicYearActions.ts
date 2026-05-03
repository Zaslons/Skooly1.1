'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getServerUser } from '@/lib/auth';
import { userHasSchoolAccess } from '@/lib/schoolAccess';
import {
  assertStartBeforeEnd,
  cloneTermPatternToAcademicYear,
  findOverlappingAcademicYear,
  setSingleActiveAcademicYear,
  TemporalRuleError,
  toDate,
} from '@/lib/domain/temporalRules';
import { schedulingActionFailure } from '@/lib/schedulingErrorContract';

const CreateAcademicYearSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters long." }),
  startDate: z.coerce.date({ message: "Invalid start date."}),
  endDate: z.coerce.date({ message: "Invalid end date."}),
  schoolId: z.string().cuid({ message: "Valid School ID is required." }),
}).refine(data => data.startDate < data.endDate, {
  message: "End date must be after start date.",
  path: ["endDate"],
});

interface CreateAcademicYearData {
  name: string;
  startDate: string;
  endDate: string;
  schoolId: string;
}

async function checkOverlappingAcademicYears(schoolId: string, startDate: Date, endDate: Date, excludeId?: string) {
  return findOverlappingAcademicYear({ schoolId, startDate, endDate, excludeId });
}

export async function createAcademicYearAction(data: CreateAcademicYearData) {
  const currentUser = await getServerUser(); 
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, data.schoolId))) {
    return {
      ...schedulingActionFailure("FORBIDDEN", "You are not authorized to perform this action."),
    };
  }
  
  const validatedFields = CreateAcademicYearSchema.safeParse({
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    schoolId: data.schoolId,
  });

  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    return {
      ...schedulingActionFailure(
        "INVALID_INPUT",
        `Validation failed: ${firstError || "Invalid input."}`,
        validatedFields.error.flatten().fieldErrors as Record<string, string[] | undefined>
      ),
    };
  }

  const { name, startDate, endDate, schoolId } = validatedFields.data;

  try {
    assertStartBeforeEnd(startDate, endDate, 'academicYear');
    const overlapping = await checkOverlappingAcademicYears(schoolId, startDate, endDate);
    if (overlapping) {
      return { success: false, message: `Date range overlaps with existing academic year "${overlapping.name}".` };
    }

    const newAcademicYear = await prisma.$transaction(async (tx) => {
      const created = await tx.academicYear.create({
        data: {
          name,
          startDate,
          endDate,
          schoolId,
          isActive: false,
          isArchived: false,
        },
      });

      const latestPreviousYear = await tx.academicYear.findFirst({
        where: {
          schoolId,
          isArchived: false,
          id: { not: created.id },
        },
        orderBy: { startDate: "desc" },
        select: { id: true, startDate: true },
      });

      if (latestPreviousYear) {
        await cloneTermPatternToAcademicYear({
          tx,
          schoolId,
          sourceAcademicYearId: latestPreviousYear.id,
          targetAcademicYearId: created.id,
          sourceAcademicYearStart: latestPreviousYear.startDate,
          targetAcademicYearStart: created.startDate,
          targetAcademicYearEnd: created.endDate,
        });
      }

      return created;
    });

    revalidatePath(`/schools/${schoolId}/academic-years`);
    revalidatePath(`/schools/${schoolId}/admin`);

    return {
      success: true,
      message: "Academic Year created successfully!",
      academicYear: newAcademicYear,
    };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false, message: "An academic year with similar details already exists." };
    }
    return { success: false, message: "Failed to create academic year due to a server error." };
  }
}

const UpdateAcademicYearSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters long." }).optional(),
  startDate: z.coerce.date({ message: "Invalid start date."}).optional(),
  endDate: z.coerce.date({ message: "Invalid end date."}).optional(),
}).refine(data => {
  if (data.startDate && data.endDate) {
    return data.startDate < data.endDate;
  }
  return true;
}, {
  message: "End date must be after start date.",
  path: ["endDate"],
});

interface UpdateAcademicYearData {
  name?: string;
  startDate?: string;
  endDate?: string;
}

export async function updateAcademicYearAction(academicYearId: string, data: UpdateAcademicYearData) {
  const validatedFields = UpdateAcademicYearSchema.safeParse(data);

  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { name, startDate, endDate } = validatedFields.data;

  if (!name && !startDate && !endDate) {
    return { success: false, message: "No fields provided for update." };
  }
  
  const existingAcademicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { schoolId: true, startDate: true, endDate: true }
  });

  if (!existingAcademicYear) {
    return { success: false, message: "Academic Year not found." };
  }

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, existingAcademicYear.schoolId))) {
    return { success: false, message: "You are not authorized to perform this action." };
  }

  const finalStartDate = startDate || existingAcademicYear.startDate;
  const finalEndDate = endDate || existingAcademicYear.endDate;

  try {
    assertStartBeforeEnd(toDate(finalStartDate), toDate(finalEndDate), 'academicYear');
  } catch (error) {
    if (error instanceof TemporalRuleError) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "Start date must be before end date." };
  }

  const overlapping = await checkOverlappingAcademicYears(
    existingAcademicYear.schoolId, finalStartDate, finalEndDate, academicYearId
  );
  if (overlapping) {
    return { success: false, message: `Date range overlaps with existing academic year "${overlapping.name}".` };
  }

  const updateData: { name?: string; startDate?: Date; endDate?: Date } = {};
  if (name) updateData.name = name;
  if (startDate) updateData.startDate = startDate;
  if (endDate) updateData.endDate = endDate;

  try {
    const updatedAcademicYear = await prisma.academicYear.update({
      where: { id: academicYearId },
      data: updateData,
    });

    revalidatePath(`/schools/${existingAcademicYear.schoolId}/academic-years`);
    revalidatePath(`/schools/${existingAcademicYear.schoolId}/admin`);

    return {
      success: true,
      message: "Academic Year updated successfully!",
      academicYear: updatedAcademicYear,
    };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: false, message: "Academic Year not found for update." };
    }
    return { success: false, message: "Failed to update academic year due to a server error." };
  }
}

export async function archiveAcademicYearAction(academicYearId: string) {
  const currentUser = await getServerUser();
  if (!currentUser) {
    return { success: false, message: "Session not found. Please log in." };
  }

  const academicYearToArchive = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { schoolId: true, isActive: true, school: { select: { activeAcademicYearId: true } } }
  });

  if (!academicYearToArchive) {
    return { success: false, message: "Academic Year not found." };
  }

  if (currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, academicYearToArchive.schoolId))) {
    return { success: false, message: "You are not authorized to archive this academic year." };
  }

  const activeEnrollments = await prisma.studentEnrollmentHistory.count({
    where: { academicYearId, departureDate: null },
  });
  if (activeEnrollments > 0) {
    return { 
      success: false, 
      message: `Cannot archive: ${activeEnrollments} student(s) are still actively enrolled. Please complete or unenroll them first.` 
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.academicYear.update({
        where: { id: academicYearId },
        data: { isArchived: true, isActive: false },
      });

      if (academicYearToArchive.school.activeAcademicYearId === academicYearId) {
        await tx.school.update({
          where: { id: academicYearToArchive.schoolId },
          data: { activeAcademicYearId: null },
        });
      }
    });

    revalidatePath(`/schools/${academicYearToArchive.schoolId}/academic-years`);
    revalidatePath(`/schools/${academicYearToArchive.schoolId}/admin`);

    return { success: true, message: "Academic Year archived successfully." };
  } catch {
    return { success: false, message: "Failed to archive academic year." };
  }
}

export async function unarchiveAcademicYearAction(academicYearId: string) {
  const currentUser = await getServerUser();
  if (!currentUser) {
    return { success: false, message: "Session not found. Please log in." };
  }

  const academicYearToUnarchive = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { schoolId: true }
  });

  if (!academicYearToUnarchive) {
    return { success: false, message: "Academic Year not found." };
  }

  if (currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, academicYearToUnarchive.schoolId))) {
    return { success: false, message: "You are not authorized to unarchive this academic year." };
  }

  try {
    await prisma.academicYear.update({
      where: { id: academicYearId },
      data: { isArchived: false },
    });

    revalidatePath(`/schools/${academicYearToUnarchive.schoolId}/academic-years`);

    return { success: true, message: "Academic Year unarchived successfully." };
  } catch {
    return { success: false, message: "Failed to unarchive academic year." };
  }
}

export async function setActiveAcademicYearAction(academicYearId: string, schoolId: string) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: "You are not authorized to perform this action for this school." };
  }

  const academicYearToActivate = await prisma.academicYear.findUnique({
    where: { id: academicYearId, schoolId },
  });

  if (!academicYearToActivate) {
    return { success: false, message: "Academic Year not found or does not belong to this school." };
  }

  if (academicYearToActivate.isArchived) {
    return { success: false, message: "Cannot activate an archived academic year. Please unarchive it first." };
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeAcademicYearId: true }
  });

  if (school?.activeAcademicYearId === academicYearId) {
    if (!academicYearToActivate.isActive) {
      await prisma.academicYear.update({
        where: { id: academicYearId },
        data: { isActive: true }
      });
      revalidatePath(`/schools/${schoolId}/academic-years`);
      revalidatePath(`/schools/${schoolId}/admin`);
      return { success: true, message: "Academic Year status affirmed as active." };
    }
    return { success: true, message: "Academic Year is already active." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await setSingleActiveAcademicYear({ tx, schoolId, academicYearId });
    });

    revalidatePath(`/schools/${schoolId}/academic-years`);
    revalidatePath(`/schools/${schoolId}/admin`);

    return { success: true, message: "Academic Year set as active successfully." };
  } catch {
    return { success: false, message: "Failed to set academic year as active." };
  }
}

export async function deactivateAcademicYearAction(academicYearId: string, schoolId: string) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: "You are not authorized to perform this action for this school." };
  }

  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId, schoolId },
    select: { id: true, isArchived: true },
  });

  if (!academicYear) {
    return { success: false, message: "Academic Year not found or does not belong to this school." };
  }
  if (academicYear.isArchived) {
    return { success: false, message: "Cannot deactivate an archived academic year." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.academicYear.update({
        where: { id: academicYearId },
        data: { isActive: false },
      });

      const school = await tx.school.findUnique({
        where: { id: schoolId },
        select: { activeAcademicYearId: true },
      });

      if (school?.activeAcademicYearId === academicYearId) {
        await tx.school.update({
          where: { id: schoolId },
          data: { activeAcademicYearId: null },
        });
      }
    });

    revalidatePath(`/schools/${schoolId}/academic-years`);
    revalidatePath(`/schools/${schoolId}/admin`);

    return { success: true, message: "Academic Year deactivated successfully." };
  } catch {
    return { success: false, message: "Failed to deactivate academic year." };
  }
}

export async function deleteAcademicYearAction(academicYearId: string, schoolId: string) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: "You are not authorized to delete this academic year." };
  }

  const ay = await prisma.academicYear.findUnique({
    where: { id: academicYearId, schoolId },
    include: {
      _count: {
        select: {
          classes: true,
          curricula: true,
          enrollmentHistory: true,
        },
      },
    },
  });

  if (!ay) {
    return { success: false, message: "Academic Year not found." };
  }

  const totalDependencies = ay._count.classes + ay._count.curricula + ay._count.enrollmentHistory;
  if (totalDependencies > 0) {
    return { 
      success: false, 
      message: `Cannot delete: this academic year has ${ay._count.classes} class(es), ${ay._count.curricula} curriculum entries, and ${ay._count.enrollmentHistory} enrollment records. Archive it instead.` 
    };
  }

  try {
    await prisma.academicYear.delete({ where: { id: academicYearId } });

    revalidatePath(`/schools/${schoolId}/academic-years`);
    revalidatePath(`/schools/${schoolId}/admin`);

    return { success: true, message: "Academic Year deleted successfully." };
  } catch {
    return { success: false, message: "Failed to delete academic year." };
  }
}
