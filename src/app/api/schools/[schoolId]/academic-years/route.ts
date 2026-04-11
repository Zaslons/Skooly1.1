import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma'; // Assuming prisma client is in lib
import { z } from 'zod';
import { requireAuth, requireRole, requireSchoolAccess, AuthUser, UserRole } from '@/lib/auth'; // Adjusted import path
import {
  assertNoAcademicYearOverlap,
  assertStartBeforeEnd,
  cloneTermPatternToAcademicYear,
  ensureAcademicYearRolloverForSchool,
  TemporalRuleError,
} from '@/lib/domain/temporalRules';

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
    await ensureAcademicYearRolloverForSchool(schoolId);

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

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;

  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const body = await request.json();
    const validation = academicYearSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { name, startDate, endDate } = validation.data;
    try {
      assertStartBeforeEnd(startDate, endDate, 'academicYear');
      await assertNoAcademicYearOverlap({ schoolId, startDate, endDate });
    } catch (error) {
      if (error instanceof TemporalRuleError) {
        return NextResponse.json(
          { code: error.code, error: error.message, fieldErrors: error.fieldErrors },
          { status: 400 }
        );
      }
      throw error;
    }

    const newAcademicYear = await prisma.$transaction(async (tx) => {
      const created = await tx.academicYear.create({
        data: {
          name,
          startDate,
          endDate,
          schoolId: schoolId,
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

    return NextResponse.json(newAcademicYear, { status: 201 });
  } catch (error: any) {
    console.error('[ACADEMIC_YEARS_POST]', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      // Unique constraint violation on name (and schoolId)
      return NextResponse.json(
        { code: 'ACADEMIC_YEAR_NAME_CONFLICT', error: 'An academic year with this name already exists for this school.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 