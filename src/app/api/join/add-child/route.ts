import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerUser, hashPassword } from '@/lib/auth';
import { z } from 'zod';

const addChildSchema = z.object({
  code: z.string().min(1),
  student: z.object({
    name: z.string().min(1),
    surname: z.string().min(1),
    birthday: z.string(),
    sex: z.enum(['MALE', 'FEMALE']),
    bloodType: z.string().min(1),
    address: z.string().min(1),
  }),
});

export async function POST(request: Request) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'parent') {
      return NextResponse.json({ error: 'Only authenticated parents can add children.' }, { status: 403 });
    }

    const body = await request.json();
    const validation = addChildSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }

    const { code, student: studentData } = validation.data;

    const joinCode = await prisma.joinCode.findUnique({
      where: { code },
      include: {
        class: { select: { id: true, name: true, gradeId: true, capacity: true, _count: { select: { students: true } } } },
      },
    });

    if (!joinCode || !joinCode.isActive || joinCode.type !== 'CLASS_STUDENT') {
      return NextResponse.json({ error: 'Invalid or inactive class enrollment code.' }, { status: 400 });
    }

    if (joinCode.expiresAt && joinCode.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This join code has expired.' }, { status: 400 });
    }

    if (joinCode.maxUses && joinCode.currentUses >= joinCode.maxUses) {
      return NextResponse.json({ error: 'This join code has reached its maximum uses.' }, { status: 400 });
    }

    if (!joinCode.class) {
      return NextResponse.json({ error: 'This join code is not linked to a class.' }, { status: 400 });
    }

    if (joinCode.class.capacity && joinCode.class._count.students >= joinCode.class.capacity) {
      return NextResponse.json({ error: 'The target class is full.' }, { status: 400 });
    }

    const parentProfile = await prisma.parent.findFirst({
      where: { authId: user.id, schoolId: joinCode.schoolId },
      select: { id: true },
    });

    if (!parentProfile) {
      return NextResponse.json({ error: 'Parent profile not found for this school.' }, { status: 400 });
    }

    const studentUsername = `${studentData.name.toLowerCase()}.${studentData.surname.toLowerCase()}.${Date.now().toString(36)}`;
    const studentPassword = await hashPassword(studentUsername);

    await prisma.$transaction(async (tx) => {
      const studentAuth = await tx.auth.create({
        data: {
          email: null,
          username: studentUsername,
          password: studentPassword,
          role: 'student',
          accountType: 'STUDENT',
        },
      });

      const studentProfile = await tx.student.create({
        data: {
          id: studentAuth.id,
          username: studentUsername,
          name: studentData.name,
          surname: studentData.surname,
          address: studentData.address,
          bloodType: studentData.bloodType,
          sex: studentData.sex,
          birthday: new Date(studentData.birthday),
          authId: studentAuth.id,
          schoolId: joinCode.schoolId,
          parentId: parentProfile.id,
          classId: joinCode.class!.id,
          gradeId: joinCode.class!.gradeId,
        },
      });

      await tx.schoolMembership.create({
        data: {
          authId: studentAuth.id,
          schoolId: joinCode.schoolId,
          role: 'student',
          studentId: studentProfile.id,
        },
      });

      const activeAY = await tx.academicYear.findFirst({
        where: { schoolId: joinCode.schoolId, isArchived: false },
        orderBy: { startDate: 'desc' },
      });

      if (activeAY) {
        await tx.studentEnrollmentHistory.create({
          data: {
            studentId: studentProfile.id,
            classId: joinCode.class!.id,
            academicYearId: activeAY.id,
            enrollmentDate: new Date(),
            status: 'ENROLLED',
          },
        });
      }

      await tx.joinCode.update({
        where: { id: joinCode.id },
        data: { currentUses: { increment: 1 } },
      });
    });

    return NextResponse.json({
      success: true,
      message: `${studentData.name} has been enrolled in ${joinCode.class!.name}.`,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Add child error:', error);
    return NextResponse.json({ error: error.message || 'An internal error occurred.' }, { status: 500 });
  }
}
