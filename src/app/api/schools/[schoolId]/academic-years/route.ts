import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma'; // Assuming prisma client is in lib
import { z } from 'zod';
import { requireAuth, requireRole, requireSchoolAccess, AuthUser, UserRole } from '@/lib/auth'; // Adjusted import path

// Zod schema for validating the request body when creating an Academic Year
const academicYearSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  startDate: z.coerce.date({ message: "Invalid start date" }), // coerce transforms string to Date
  endDate: z.coerce.date({ message: "Invalid end date" }),
  // isActive and isArchived will default to false as per the schema
});

// GET handler to fetch all academic years for a specific school
export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const { schoolId } = params;
  if (!schoolId) {
    return NextResponse.json({ error: 'School ID is required' }, { status: 400 });
  }

  // Authentication and Authorization
  const userOrResponse = await requireSchoolAccess(request, schoolId);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  // At this point, user is authenticated and has access to this schoolId
  // const user: AuthUser = userOrResponse; // If you need user details

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get('includeArchived') === 'true';

  try {
    const whereClause: any = {
      schoolId: schoolId,
    };
    if (!includeArchived) {
      whereClause.isArchived = false;
    }

    const academicYears = await prisma.academicYear.findMany({
      where: whereClause,
      orderBy: {
        startDate: 'desc',
      },
    });
    return NextResponse.json(academicYears, { status: 200 });
  } catch (error) {
    console.error('[ACADEMIC_YEARS_GET]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST handler to create a new academic year for a specific school
export async function POST(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const { schoolId } = params;
  if (!schoolId) {
    return NextResponse.json({ error: 'School ID is required' }, { status: 400 });
  }

  // Authentication and Authorization: Only 'admin' of this school can create
  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;

  // Ensure admin is creating for their own school
  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: Admin can only create academic years for their own school.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = academicYearSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { name, startDate, endDate } = validation.data;
    if (startDate >= endDate) {
      return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 });
    }
    
    // Optional: Add logic to check for overlapping academic years for the same school if needed

    const newAcademicYear = await prisma.academicYear.create({
      data: {
        name,
        startDate,
        endDate,
        schoolId: schoolId,
        // isActive and isArchived default to false in the schema
      },
    });

    return NextResponse.json(newAcademicYear, { status: 201 });
  } catch (error: any) {
    console.error('[ACADEMIC_YEARS_POST]', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      // Unique constraint violation on name (and schoolId)
      return NextResponse.json({ error: 'An academic year with this name already exists for this school.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 