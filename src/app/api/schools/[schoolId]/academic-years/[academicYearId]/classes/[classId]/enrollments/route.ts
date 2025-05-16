import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { requireAuth, requireRole, AuthUser, UserRole } from '@/lib/auth';

// Zod schema for enrolling a student
const studentEnrollmentSchema = z.object({
  studentId: z.string().cuid({ message: "Valid Student ID is required" }),
  enrollmentDate: z.coerce.date().optional(), // Defaults to now() in schema if not provided
});

// GET: List students enrolled in a specific class for a specific academic year
export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string; classId: string } }
) {
  const { schoolId, academicYearId, classId: classIdStr } = params;
  if (!schoolId || !academicYearId || !classIdStr) {
    return NextResponse.json({ error: 'School ID, Academic Year ID, and Class ID are required' }, { status: 400 });
  }
  const classId = parseInt(classIdStr, 10);
  if (isNaN(classId)) {
    return NextResponse.json({ error: 'Invalid Class ID format' }, { status: 400 });
  }

  // Authentication & Authorization: Admin of this school
  // Teachers might also need this, could be expanded later or use requireSchoolAccess if appropriate
  const userOrResponse = await requireRole(request, ['admin', 'teacher']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user: AuthUser = userOrResponse;
  if (user.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Forbidden: User can only view enrollments for their own school.' }, { status: 403 });
  }

  try {
    // Verify the class exists and belongs to the specified school and academic year
    const classToView = await prisma.class.findUnique({
      where: { id: classId, schoolId: schoolId, academicYearId: academicYearId },
    });
    if (!classToView) {
      return NextResponse.json({ error: 'Class not found for this school and academic year' }, { status: 404 });
    }

    // Fetch active enrollments for this class
    const enrollments = await prisma.studentEnrollmentHistory.findMany({
      where: {
        classId: classId,
        academicYearId: academicYearId, // Redundant check given classToView, but good for explicitnes
        schoolId: schoolId, // Also redundant, but explicit
        departureDate: null, // Only active enrollments
      },
      include: {
        student: { // Include student details
          select: {
            id: true,
            username: true,
            name: true,
            surname: true,
            email: true,
          }
        },
      },
      orderBy: {
        student: { surname: 'asc' }, // Order by student's last name
      },
    });

    return NextResponse.json(enrollments.map(e => e.student), { status: 200 }); // Return list of student details

  } catch (error) {
    console.error('[CLASS_ENROLLMENTS_GET]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Enroll a student into a specific class for a specific academic year
export async function POST(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string; classId: string } }
) {
  const { schoolId, academicYearId, classId: classIdStr } = params;
  if (!schoolId || !academicYearId || !classIdStr) {
    return NextResponse.json({ error: 'School ID, Academic Year ID, and Class ID are required' }, { status: 400 });
  }
  const classId = parseInt(classIdStr, 10);
  if (isNaN(classId)) {
    return NextResponse.json({ error: 'Invalid Class ID format' }, { status: 400 });
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
    const validation = studentEnrollmentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { studentId, enrollmentDate } = validation.data;

    // Start transaction for multiple checks and creation
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify the class exists, belongs to the school and academic year
      const targetClass = await tx.class.findUnique({
        where: { id: classId, schoolId: schoolId, academicYearId: academicYearId },
      });
      if (!targetClass) {
        throw { type: 'custom', status: 404, message: 'Target class not found for this school and academic year' };
      }

      // 2. Verify student exists and belongs to the school
      const studentToEnroll = await tx.student.findUnique({
        where: { id: studentId, schoolId: schoolId },
      });
      if (!studentToEnroll) {
        throw { type: 'custom', status: 404, message: 'Student not found in this school' };
      }

      // 3. Check if student is already actively enrolled in this class
      const existingActiveEnrollment = await tx.studentEnrollmentHistory.findFirst({
        where: {
          studentId: studentId,
          classId: classId,
          departureDate: null, // Actively enrolled
        },
      });
      if (existingActiveEnrollment) {
        throw { type: 'custom', status: 409, message: 'Student is already actively enrolled in this class.' };
      }

      // 4. Create the enrollment record
      // The academicYearId for the enrollment record comes from the targetClass
      const newEnrollment = await tx.studentEnrollmentHistory.create({
        data: {
          studentId: studentId,
          classId: classId,
          academicYearId: targetClass.academicYearId, // Ensure this matches the class's AY
          schoolId: schoolId, // Denormalized from student/class for consistency
          enrollmentDate: enrollmentDate || new Date(), // Default to now if not provided
          // departureDate is null by default, meaning active enrollment
        },
        include: {
          student: { select: { id: true, name: true, surname: true } },
          class: { select: { id: true, name: true } },
        },
      });
      
      // 5. Optional: Update Student.classId and Student.gradeId to current class/grade (if you maintain these)
      // This depends on your application logic for these fields on the Student model.
      // For now, we assume StudentEnrollmentHistory is the source of truth for current class.
      // await tx.student.update({
      //   where: { id: studentId },
      //   data: { classId: targetClass.id, gradeId: targetClass.gradeId }
      // });

      return newEnrollment;
    });

    return NextResponse.json(result, { status: 201 });

  } catch (error: any) {
    console.error('[CLASS_ENROLLMENT_POST]', error);
    if (error.type === 'custom') {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error.code === 'P2002') { // Unique constraint violation (e.g. @@unique([studentId, classId]))
      // This might indicate a student was previously in this exact class record and the record wasn't deleted,
      // or an attempt to create a duplicate where one already exists.
      return NextResponse.json({ error: 'This student cannot be enrolled in this class due to a conflict. They may have a previous enrollment record for this specific class instance.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 