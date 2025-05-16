import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma'; // Assuming prisma client is in lib
import { z } from 'zod';
import { requireAuth, requireRole, requireSchoolAccess, AuthUser, UserRole } from '@/lib/auth'; // Adjusted import path

// Zod schema for validating the request body when updating an Academic Year
// All fields are optional for PATCH requests
const academicYearUpdateSchema = z.object({
  name: z.string().min(1, { message: "Name cannot be empty" }).optional(),
  startDate: z.coerce.date({ message: "Invalid start date" }).optional(),
  endDate: z.coerce.date({ message: "Invalid end date" }).optional(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
}).refine(data => {
  // Ensure that if both startDate and endDate are provided, startDate is before endDate
  if (data.startDate && data.endDate) {
    return data.startDate < data.endDate;
  }
  return true;
}, {
  message: "Start date must be before end date if both are provided",
  path: ["endDate"], // Path to associate the error with, typically the second field in comparison
});

// GET handler to fetch a specific academic year by its ID
export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string } }
) {
  const { schoolId, academicYearId } = params;

  if (!schoolId || !academicYearId) {
    return NextResponse.json({ error: 'School ID and Academic Year ID are required' }, { status: 400 });
  }

  // Authentication and Authorization
  const userOrResponse = await requireSchoolAccess(request, schoolId);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  // const user: AuthUser = userOrResponse; // User is authenticated and has access to this schoolId

  try {
    // TODO: Add authentication and authorization here
    // Ensure user has permission to view this academic year for this school

    const academicYear = await prisma.academicYear.findUnique({
      where: {
        id: academicYearId,
        schoolId: schoolId, // Ensure it belongs to the specified school
      },
    });

    if (!academicYear) {
      return NextResponse.json({ error: 'Academic Year not found' }, { status: 404 });
    }

    return NextResponse.json(academicYear, { status: 200 });
  } catch (error) {
    console.error('[ACADEMIC_YEAR_GET_BY_ID]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH handler to update an existing academic year
export async function PATCH(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string } }
) {
  const { schoolId, academicYearId } = params;

  if (!schoolId || !academicYearId) {
    return NextResponse.json({ error: 'School ID and Academic Year ID are required' }, { status: 400 });
  }

  // Authentication and Authorization: Only 'admin' of this school can update
  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;

  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: Admin can only update academic years for their own school.' }, { status: 403 });
  }

  try {
    // TODO: Add authentication and authorization here
    // Ensure user has permission to update this academic year for this school

    const body = await request.json();
    const validation = academicYearUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, startDate, endDate, isActive, isArchived } = validation.data;
    
    const existingAcademicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId, schoolId: schoolId }
    });

    if (!existingAcademicYear) {
      return NextResponse.json({ error: 'Academic Year not found to update' }, { status: 404 });
    }

    // If isActive is being set to true, ensure all other academic years for this school are set to isActive: false
    // and update the school's activeAcademicYearId
    if (isActive === true) {
      await prisma.$transaction(async (tx) => {
        await tx.academicYear.updateMany({
          where: {
            schoolId: schoolId,
            id: { not: academicYearId }, 
          },
          data: {
            isActive: false,
          },
        });
        await tx.school.update({
          where: { id: schoolId },
          data: { activeAcademicYearId: academicYearId },
        });
      });
    } else if (isActive === false) {
      // If explicitly setting this year to inactive, check if it was the active one on the school model
      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      if (school?.activeAcademicYearId === academicYearId) {
        await prisma.school.update({
          where: { id: schoolId },
          data: { activeAcademicYearId: null }, // Set to null as this one is no longer active
        });
      }
    }

    const updatedAcademicYear = await prisma.academicYear.update({
      where: {
        id: academicYearId,
        schoolId: schoolId, 
      },
      data: {
        name,
        startDate,
        endDate,
        isActive,
        isArchived: isArchived !== undefined ? isArchived : existingAcademicYear.isArchived, // Preserve existing isArchived if not provided
      },
    });

    return NextResponse.json(updatedAcademicYear, { status: 200 });
  } catch (error: any) {
    console.error('[ACADEMIC_YEAR_PATCH]', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      return NextResponse.json({ error: 'An academic year with this name already exists for this school.' }, { status: 409 });
    }
    // P2025: Record to update not found (should be caught by the findUnique check earlier, but as a fallback)
    if (error.code === 'P2025') {
        return NextResponse.json({ error: 'Academic Year not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE handler to remove an academic year (now soft delete/archive)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string } }
) {
  const { schoolId, academicYearId } = params;

  if (!schoolId || !academicYearId) {
    return NextResponse.json({ error: 'School ID and Academic Year ID are required' }, { status: 400 });
  }

  // Authentication and Authorization: Only 'admin' of this school can archive
  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;

  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: Admin can only archive academic years for their own school.' }, { status: 403 });
  }

  try {
    // TODO: Add authentication and authorization here
    // Ensure user has permission to archive this academic year for this school

    const academicYearToArchive = await prisma.academicYear.findUnique({
        where: { id: academicYearId, schoolId: schoolId }
    });

    if (!academicYearToArchive) {
        return NextResponse.json({ error: 'Academic Year not found' }, { status: 404 });
    }

    if (academicYearToArchive.isArchived) {
        return NextResponse.json({ error: 'Academic Year is already archived' }, { status: 400 });
    }

    // Archive the academic year
    const archivedAcademicYear = await prisma.academicYear.update({
      where: {
        id: academicYearId,
        schoolId: schoolId,
      },
      data: {
        isArchived: true,
        isActive: false, // Always deactivate when archiving
      },
    });

    // If this academic year was the active one for the school, clear it
    const school = await prisma.school.findUnique({ where: { id: schoolId }});
    if (school?.activeAcademicYearId === academicYearId) {
        await prisma.school.update({
            where: { id: schoolId },
            data: { activeAcademicYearId: null }
        });
    }

    return NextResponse.json(archivedAcademicYear, { status: 200 });
  } catch (error: any) {
    console.error('[ACADEMIC_YEAR_ARCHIVE]', error); // Renamed log for clarity
    if (error.code === 'P2025') { // Record to update not found
        return NextResponse.json({ error: 'Academic Year not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 