import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { requireAuth, requireRole, AuthUser, UserRole } from '@/lib/auth';

// Zod schema for validating the request body when creating a Curriculum entry
const curriculumCreateSchema = z.object({
  gradeId: z.number().int().positive({ message: "Valid Grade ID is required" }), // Assuming Grade ID is Int
  subjectId: z.number().int().positive({ message: "Valid Subject ID is required" }), // Assuming Subject ID is Int
  description: z.string().optional(),
  textbook: z.string().optional(),
});

// GET handler to fetch curriculum entries for a specific school and academic year
export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string } }
) {
  const { schoolId, academicYearId } = params;
  if (!schoolId || !academicYearId) {
    return NextResponse.json({ error: 'School ID and Academic Year ID are required' }, { status: 400 });
  }

  // Authentication & Authorization: User must be an admin of this school
  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;
  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: Admin can only view curriculum for their own school.' }, { status: 403 });
  }
  
  const { searchParams } = new URL(request.url);
  const gradeIdQuery = searchParams.get('gradeId');

  try {
    // Verify the academic year belongs to the school
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId, schoolId: schoolId },
    });
    if (!academicYear) {
      return NextResponse.json({ error: 'Academic Year not found for this school' }, { status: 404 });
    }

    const whereClause: any = {
      schoolId: schoolId,
      academicYearId: academicYearId,
    };

    if (gradeIdQuery) {
      const gradeId = parseInt(gradeIdQuery, 10);
      if (isNaN(gradeId) || gradeId <= 0) {
        return NextResponse.json({ error: 'Invalid gradeId query parameter' }, { status: 400 });
      }
      whereClause.gradeId = gradeId;
    }

    const curriculumEntries = await prisma.curriculum.findMany({
      where: whereClause,
      include: {
        grade: { select: { id: true, level: true } }, // Include grade level
        subject: { select: { id: true, name: true } }, // Include subject name
      },
      orderBy: [
        { grade: { level: 'asc' } }, 
        { subject: { name: 'asc' } }
      ],
    });

    return NextResponse.json(curriculumEntries, { status: 200 });
  } catch (error) {
    console.error('[CURRICULUM_GET]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST handler to create a new curriculum entry
export async function POST(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string } }
) {
  const { schoolId, academicYearId } = params;
  if (!schoolId || !academicYearId) {
    return NextResponse.json({ error: 'School ID and Academic Year ID are required' }, { status: 400 });
  }

  // Authentication & Authorization: User must be an admin of this school
  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;
  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: Admin can only manage curriculum for their own school.' }, { status: 403 });
  }

  try {
    // Verify the academic year belongs to the school
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId, schoolId: schoolId },
    });
    if (!academicYear) {
      return NextResponse.json({ error: 'Academic Year not found for this school' }, { status: 404 });
    }

    const body = await request.json();
    const validation = curriculumCreateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { gradeId, subjectId, description, textbook } = validation.data;

    // Verify Grade and Subject belong to the same school
    const [grade, subject] = await Promise.all([
      prisma.grade.findUnique({ where: { id: gradeId, schoolId: schoolId } }),
      prisma.subject.findUnique({ where: { id: subjectId, schoolId: schoolId } }),
    ]);

    if (!grade) {
      return NextResponse.json({ error: 'Grade not found for this school' }, { status: 404 });
    }
    if (!subject) {
      return NextResponse.json({ error: 'Subject not found for this school' }, { status: 404 });
    }

    const newCurriculumEntry = await prisma.curriculum.create({
      data: {
        schoolId: schoolId,
        academicYearId: academicYearId,
        gradeId: gradeId,
        subjectId: subjectId,
        description: description,
        textbook: textbook,
      },
      include: {
        grade: { select: { id: true, level: true } },
        subject: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(newCurriculumEntry, { status: 201 });
  } catch (error: any) {
    console.error('[CURRICULUM_POST]', error);
    if (error.code === 'P2002') { // Unique constraint violation
      return NextResponse.json({ error: 'This subject is already assigned to this grade for this academic year.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 