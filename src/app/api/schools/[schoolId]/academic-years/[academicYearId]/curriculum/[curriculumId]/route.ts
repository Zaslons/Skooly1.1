import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { requireAuth, requireRole, AuthUser, UserRole } from '@/lib/auth';

// Zod schema for validating the request body when updating a Curriculum entry
const curriculumUpdateSchema = z.object({
  description: z.string().optional(),
  textbook: z.string().optional(),
  // gradeId, subjectId, academicYearId, schoolId are not typically updatable for a curriculum entry.
  // If a subject needs to be changed for a grade/year, it's usually by deleting the old entry and creating a new one.
});

// GET handler for a specific curriculum entry
export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string; curriculumId: string } }
) {
  const { schoolId, academicYearId, curriculumId } = params;
  if (!schoolId || !academicYearId || !curriculumId) {
    return NextResponse.json({ error: 'School ID, Academic Year ID, and Curriculum ID are required' }, { status: 400 });
  }

  // Authentication & Authorization: Admin of this school
  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;
  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: Admin can only view their school\'s curriculum.' }, { status: 403 });
  }

  try {
    const curriculumEntry = await prisma.curriculum.findUnique({
      where: {
        id: curriculumId,
        schoolId: schoolId, // Ensure it belongs to the specified school
        academicYearId: academicYearId, // And the specified academic year
      },
      include: {
        grade: { select: { id: true, level: true } },
        subject: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });

    if (!curriculumEntry) {
      return NextResponse.json({ error: 'Curriculum entry not found' }, { status: 404 });
    }
    return NextResponse.json(curriculumEntry, { status: 200 });
  } catch (error) {
    console.error('[CURRICULUM_GET_BY_ID]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH handler to update a specific curriculum entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string; curriculumId: string } }
) {
  const { schoolId, academicYearId, curriculumId } = params;
  if (!schoolId || !academicYearId || !curriculumId) {
    return NextResponse.json({ error: 'School ID, Academic Year ID, and Curriculum ID are required' }, { status: 400 });
  }

  // Authentication & Authorization: Admin of this school
  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;
  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: Admin can only update their school\'s curriculum.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = curriculumUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { description, textbook } = validation.data;

    // Ensure the curriculum entry exists and belongs to the specified school and academic year before updating
    const existingEntry = await prisma.curriculum.findUnique({
      where: { id: curriculumId, schoolId: schoolId, academicYearId: academicYearId },
    });
    if (!existingEntry) {
      return NextResponse.json({ error: 'Curriculum entry not found for this school and academic year' }, { status: 404 });
    }

    const updatedCurriculumEntry = await prisma.curriculum.update({
      where: {
        id: curriculumId,
        // No need to re-check schoolId and academicYearId here as findUnique above confirmed it.
      },
      data: {
        description: description,
        textbook: textbook,
      },
      include: {
        grade: { select: { id: true, level: true } },
        subject: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updatedCurriculumEntry, { status: 200 });
  } catch (error: any) {
    console.error('[CURRICULUM_PATCH]', error);
    // P2025: Record to update not found (should be caught by the findUnique check earlier)
    if (error.code === 'P2025') {
        return NextResponse.json({ error: 'Curriculum entry not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE handler to remove a specific curriculum entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string; curriculumId: string } }
) {
  const { schoolId, academicYearId, curriculumId } = params;
  if (!schoolId || !academicYearId || !curriculumId) {
    return NextResponse.json({ error: 'School ID, Academic Year ID, and Curriculum ID are required' }, { status: 400 });
  }

  // Authentication & Authorization: Admin of this school
  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;
  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: Admin can only delete their school\'s curriculum.' }, { status: 403 });
  }

  try {
    // Ensure the curriculum entry exists and belongs to the specified school and academic year before deleting
    const existingEntry = await prisma.curriculum.findUnique({
      where: { id: curriculumId, schoolId: schoolId, academicYearId: academicYearId },
    });
    if (!existingEntry) {
      return NextResponse.json({ error: 'Curriculum entry not found for this school and academic year' }, { status: 404 });
    }

    await prisma.curriculum.delete({
      where: {
        id: curriculumId,
        // No need to re-check schoolId and academicYearId here as findUnique above confirmed it.
      },
    });

    return NextResponse.json({ message: 'Curriculum entry deleted successfully' }, { status: 200 }); // Or 204 No Content
  } catch (error: any) {
    console.error('[CURRICULUM_DELETE]', error);
    // P2025: Record to delete not found (should be caught by findUnique check)
    if (error.code === 'P2025') {
        return NextResponse.json({ error: 'Curriculum entry not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 