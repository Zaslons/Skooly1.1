import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { requireAuth, requireRole, AuthUser, UserRole } from '@/lib/auth';

// Zod schema for updating an enrollment (e.g., setting departure date)
const enrollmentUpdateSchema = z.object({
  departureDate: z.coerce.date({ message: "Invalid departure date" }),
  // status: z.nativeEnum(EnrollmentStatus).optional(), // If you add an EnrollmentStatus enum
});

// PATCH: Update a specific student enrollment record (e.g., to unenroll by setting departureDate)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { schoolId: string; enrollmentId: string } }
) {
  const { schoolId, enrollmentId } = params;
  if (!schoolId || !enrollmentId) {
    return NextResponse.json({ error: 'School ID and Enrollment ID are required' }, { status: 400 });
  }

  // Authentication & Authorization: Admin of this school
  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;
  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: Admin can only manage enrollments for their own school.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = enrollmentUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { departureDate } = validation.data;

    // Verify the enrollment record exists and belongs to the specified school
    const existingEnrollment = await prisma.studentEnrollmentHistory.findUnique({
      where: { id: enrollmentId, schoolId: schoolId },
    });

    if (!existingEnrollment) {
      return NextResponse.json({ error: 'Enrollment record not found for this school' }, { status: 404 });
    }

    if (existingEnrollment.departureDate) {
      return NextResponse.json({ error: 'Student is already un-enrolled (departure date set).' }, { status: 400 });
    }

    // Ensure departureDate is not before enrollmentDate
    if (departureDate < existingEnrollment.enrollmentDate) {
      return NextResponse.json({ error: 'Departure date cannot be before enrollment date.' }, { status: 400 });
    }

    const updatedEnrollment = await prisma.studentEnrollmentHistory.update({
      where: {
        id: enrollmentId,
      },
      data: {
        departureDate: departureDate,
        // status: status, // If you implement status
      },
      include: {
        student: { select: { id: true, name: true, surname: true } },
        class: { select: { id: true, name: true } },
      },
    });
    
    // Optional: If you update Student.classId/gradeId for current enrollment,
    // you might want to set them to null here if this was the current class.
    // This requires checking if this was the student's latest/current enrollment.
    // For now, this is left out for simplicity, assuming StudentEnrollmentHistory is primary.
    // const student = await prisma.student.findUnique({ where: { id: existingEnrollment.studentId } });
    // if (student && student.classId === existingEnrollment.classId) {
    //   await prisma.student.update({
    //     where: { id: existingEnrollment.studentId },
    //     data: { classId: null, gradeId: null }
    //   });
    // }

    return NextResponse.json(updatedEnrollment, { status: 200 });

  } catch (error: any) {
    console.error('[ENROLLMENT_PATCH]', error);
    if (error.code === 'P2025') { // Record to update not found
      return NextResponse.json({ error: 'Enrollment record not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 