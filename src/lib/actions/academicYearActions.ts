'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers'; // Import cookies
import { verifyToken, AuthUser } from '@/lib/auth'; // Import verifyToken and AuthUser
// You might have a more specific requireRoleForSchoolAction helper

// Helper to get current authenticated user in a Server Action
async function getCurrentUser(): Promise<AuthUser | null> {
  const tokenCookie = cookies().get('auth_token');
  if (!tokenCookie) {
    return null;
  }
  const user = await verifyToken(tokenCookie.value);
  return user;
}

// Zod schema for creating an academic year
const CreateAcademicYearSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters long." }),
  startDate: z.coerce.date({ message: "Invalid start date."}),
  endDate: z.coerce.date({ message: "Invalid end date."}),
  schoolId: z.string().cuid({ message: "Valid School ID is required." }),
}).refine(data => data.startDate < data.endDate, {
  message: "End date must be after start date.",
  path: ["endDate"], // Point error to endDate field
});

// Type for the data expected by createAcademicYearAction based on client-side data
// This matches the structure from AcademicYearsClient.tsx
interface CreateAcademicYearData {
  name: string;
  startDate: string; // ISO string date
  endDate: string;   // ISO string date
  schoolId: string;
}


export async function createAcademicYearAction(data: CreateAcademicYearData) {
  // 1. Get user authentication and authorization
  const currentUser = await getCurrentUser(); 
  if (!currentUser || currentUser.schoolId !== data.schoolId || currentUser.role !== 'admin') {
    console.error("Unauthorized attempt to create academic year:", { userId: currentUser?.id, schoolId: data.schoolId, userRole: currentUser?.role });
    throw new Error("You are not authorized to perform this action or your session is invalid.");
  }
  
  // 2. Validate input data
  const validatedFields = CreateAcademicYearSchema.safeParse({
    name: data.name,
    startDate: data.startDate, // Zod will coerce this string to Date
    endDate: data.endDate,     // Zod will coerce this string to Date
    schoolId: data.schoolId,
  });

  if (!validatedFields.success) {
    console.error("Validation failed:", validatedFields.error.flatten().fieldErrors);
    // Construct a user-friendly error message or throw an error with details
    // For simplicity, throwing a generic error with the first issue
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    throw new Error(`Validation failed: ${firstError || 'Invalid input.'}`);
  }

  const { name, startDate, endDate, schoolId } = validatedFields.data;

  try {
    // 3. Create the academic year in the database
    const newAcademicYear = await prisma.academicYear.create({
      data: {
        name,
        startDate,
        endDate,
        schoolId,
        isActive: false, // New academic years are not active by default
        isArchived: false,
      },
    });

    // 4. Revalidate the path to refresh the UI
    // Adjust the path if your page is located elsewhere
    revalidatePath(`/schools/${schoolId}/academic-years`); // Matches the page structure
    // Also revalidate the admin dashboard if it shows active AY info
    revalidatePath(`/schools/${schoolId}/admin`);


    return {
      success: true,
      message: "Academic Year created successfully!",
      academicYear: newAcademicYear,
    };

  } catch (error: any) {
    console.error("Error creating academic year:", error);
    // Check for specific Prisma errors if needed (e.g., unique constraint violations)
    // P2002 is unique constraint violation
    if (error.code === 'P2002') {
         throw new Error("An academic year with similar details might already exist.");
    }
    throw new Error("Failed to create academic year due to a server error.");
  }
}

// Zod schema for updating an academic year
const UpdateAcademicYearSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters long." }).optional(),
  startDate: z.coerce.date({ message: "Invalid start date."}).optional(),
  endDate: z.coerce.date({ message: "Invalid end date."}).optional(),
  // schoolId is not directly updatable but used for auth and context
}).refine(data => {
  // If both dates are provided, end date must be after start date
  if (data.startDate && data.endDate) {
    return data.startDate < data.endDate;
  }
  return true; // If one or none are provided, this specific check passes
}, {
  message: "End date must be after start date.",
  path: ["endDate"],
});

// Type for the data expected by updateAcademicYearAction
interface UpdateAcademicYearData {
  name?: string;
  startDate?: string; // ISO string date
  endDate?: string;   // ISO string date
}

export async function updateAcademicYearAction(academicYearId: string, data: UpdateAcademicYearData) {
  // 1. Validate input data - ensure at least one field is being updated
  const validatedFields = UpdateAcademicYearSchema.safeParse(data);

  if (!validatedFields.success) {
    console.error("Validation failed for update:", validatedFields.error.flatten().fieldErrors);
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    throw new Error(`Validation failed: ${firstError || 'Invalid input.'}`);
  }

  const { name, startDate, endDate } = validatedFields.data;

  // Ensure at least one field is provided for update
  if (!name && !startDate && !endDate) {
    throw new Error("No fields provided for update.");
  }
  
  // Fetch the existing academic year to check its schoolId for authorization
  const existingAcademicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { schoolId: true }
  });

  if (!existingAcademicYear) {
    throw new Error("Academic Year not found.");
  }

  // 2. Get user authentication and authorization
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.schoolId !== existingAcademicYear.schoolId || currentUser.role !== 'admin') {
    console.error("Unauthorized attempt to update academic year:", { userId: currentUser?.id, schoolId: existingAcademicYear.schoolId, userRole: currentUser?.role });
    throw new Error("You are not authorized to perform this action.");
  }

  // Refine data for update: only include fields that were actually passed
  const updateData: { name?: string; startDate?: Date; endDate?: Date } = {};
  if (name) updateData.name = name;
  if (startDate) updateData.startDate = startDate; // Already Date objects from Zod
  if (endDate) updateData.endDate = endDate;

  // If only one date is provided, we need to ensure the other date maintains the start < end constraint
  if (startDate && !endDate) {
    const currentEndDate = (await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { endDate: true } }))?.endDate;
    if (currentEndDate && startDate >= currentEndDate) {
      throw new Error("Start date must be before the current end date.");
    }
  }
  if (endDate && !startDate) {
    const currentStartDate = (await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { startDate: true } }))?.startDate;
    if (currentStartDate && endDate <= currentStartDate) {
      throw new Error("End date must be after the current start date.");
    }
  }


  try {
    // 3. Update the academic year in the database
    const updatedAcademicYear = await prisma.academicYear.update({
      where: { id: academicYearId },
      data: updateData,
    });

    // 4. Revalidate the path
    revalidatePath(`/schools/${existingAcademicYear.schoolId}/academic-years`);
    revalidatePath(`/schools/${existingAcademicYear.schoolId}/admin`);


    return {
      success: true,
      message: "Academic Year updated successfully!",
      academicYear: updatedAcademicYear,
    };

  } catch (error: any) {
    console.error("Error updating academic year:", error);
    if (error.code === 'P2025') { // Record to update not found
        throw new Error("Academic Year not found for update.");
    }
    throw new Error("Failed to update academic year due to a server error.");
  }
}

export async function archiveAcademicYearAction(academicYearId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Session not found. Please log in.");
  }

  const academicYearToArchive = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { schoolId: true, isActive: true, school: { select: { activeAcademicYearId: true } } }
  });

  if (!academicYearToArchive) {
    throw new Error("Academic Year not found.");
  }

  if (currentUser.schoolId !== academicYearToArchive.schoolId || currentUser.role !== 'admin') {
    throw new Error("You are not authorized to archive this academic year.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.academicYear.update({
        where: { id: academicYearId },
        data: {
          isArchived: true,
          isActive: false, // Archiving always deactivates
        },
      });

      // If this was the school's active academic year, clear it from the school
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

  } catch (error) {
    console.error("Error archiving academic year:", error);
    throw new Error("Failed to archive academic year.");
  }
}

export async function unarchiveAcademicYearAction(academicYearId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Session not found. Please log in.");
  }

  const academicYearToUnarchive = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { schoolId: true }
  });

  if (!academicYearToUnarchive) {
    throw new Error("Academic Year not found.");
  }

  if (currentUser.schoolId !== academicYearToUnarchive.schoolId || currentUser.role !== 'admin') {
    throw new Error("You are not authorized to unarchive this academic year.");
  }

  try {
    await prisma.academicYear.update({
      where: { id: academicYearId },
      data: {
        isArchived: false,
        // isActive remains false, user must explicitly set it active again if desired
      },
    });

    revalidatePath(`/schools/${academicYearToUnarchive.schoolId}/academic-years`);
    // No need to revalidate /admin specifically unless it shows archived counts directly

    return { success: true, message: "Academic Year unarchived successfully." };

  } catch (error) {
    console.error("Error unarchiving academic year:", error);
    throw new Error("Failed to unarchive academic year.");
  }
}

export async function setActiveAcademicYearAction(academicYearId: string, schoolId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.schoolId !== schoolId || currentUser.role !== 'admin') {
    throw new Error("You are not authorized to perform this action for this school.");
  }

  const academicYearToActivate = await prisma.academicYear.findUnique({
    where: { id: academicYearId, schoolId: schoolId },
  });

  if (!academicYearToActivate) {
    throw new Error("Academic Year not found or does not belong to this school.");
  }

  if (academicYearToActivate.isArchived) {
    throw new Error("Cannot activate an archived academic year. Please unarchive it first.");
  }

  // Check if it's already the active one for the school
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeAcademicYearId: true }
  });

  if (school?.activeAcademicYearId === academicYearId) {
    // Optionally, still ensure the AY record itself is marked active.
    // This handles a case where School.activeAcademicYearId might point to an AY
    // that somehow got its own isActive flag turned off.
    if (!academicYearToActivate.isActive) {
       await prisma.academicYear.update({
           where: { id: academicYearId },
           data: { isActive: true }
       });
       revalidatePath(`/schools/${schoolId}/academic-years`);
       revalidatePath(`/schools/${schoolId}/admin`);
       return { success: true, message: "Academic Year is already active and its status has been affirmed." };
    }
    return { success: true, message: "Academic Year is already active." }; // No change needed
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Deactivate all other academic years for this school
      await tx.academicYear.updateMany({
        where: {
          schoolId: schoolId,
          id: { not: academicYearId },
        },
        data: { isActive: false },
      });

      // 2. Activate the target academic year
      await tx.academicYear.update({
        where: { id: academicYearId },
        data: { 
          isActive: true,
          isArchived: false, // Ensure it's not archived if we are activating
        },
      });

      // 3. Update the school's active academic year
      await tx.school.update({
        where: { id: schoolId },
        data: { activeAcademicYearId: academicYearId },
      });
    });

    revalidatePath(`/schools/${schoolId}/academic-years`);
    revalidatePath(`/schools/${schoolId}/admin`);

    return { success: true, message: "Academic Year set as active successfully." };

  } catch (error) {
    console.error("Error setting active academic year:", error);
    throw new Error("Failed to set academic year as active.");
  }
} 