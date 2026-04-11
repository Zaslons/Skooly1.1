import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, authenticateUser } from '@/lib/auth';
import { z } from 'zod';
import { cookies } from 'next/headers';

const parentStudentJoinSchema = z.object({
  code: z.string().min(1),
  parent: z.object({
    name: z.string().min(1),
    surname: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    address: z.string().min(1),
    username: z.string().min(3).max(30),
    password: z.string().min(8),
  }),
  student: z.object({
    name: z.string().min(1),
    surname: z.string().min(1),
    birthday: z.string(),
    sex: z.enum(['MALE', 'FEMALE']),
    bloodType: z.string().min(1),
    address: z.string().min(1),
  }),
});

const teacherJoinSchema = z.object({
  code: z.string().min(1),
  teacher: z.object({
    name: z.string().min(1),
    surname: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    address: z.string().min(1),
    username: z.string().min(3).max(30),
    password: z.string().min(8),
    bloodType: z.string().min(1),
    sex: z.enum(['MALE', 'FEMALE', 'OTHER']),
    birthday: z.string().min(1),
  }),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const joinCode = await prisma.joinCode.findUnique({
      where: { code: body.code },
      include: {
        school: { select: { id: true, name: true } },
        class: { select: { id: true, name: true, gradeId: true, capacity: true, _count: { select: { students: true } } } },
      },
    });

    if (!joinCode || !joinCode.isActive) {
      return NextResponse.json({ error: 'Invalid or inactive join code.' }, { status: 400 });
    }

    if (joinCode.expiresAt && joinCode.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This join code has expired.' }, { status: 400 });
    }

    if (joinCode.maxUses && joinCode.currentUses >= joinCode.maxUses) {
      return NextResponse.json({ error: 'This join code has reached its maximum uses.' }, { status: 400 });
    }

    if (joinCode.type === 'CLASS_STUDENT') {
      return await handleParentStudentJoin(body, joinCode);
    } else if (joinCode.type === 'TEACHER_INVITE') {
      return await handleTeacherJoin(body, joinCode);
    } else if (joinCode.type === 'PARENT_LINK') {
      return await handleParentLinkJoin(body, joinCode);
    }

    return NextResponse.json({ error: 'Unsupported join code type.' }, { status: 400 });
  } catch (error: any) {
    console.error('Join error:', error);
    return NextResponse.json({ error: error.message || 'An internal error occurred.' }, { status: 500 });
  }
}

async function handleParentStudentJoin(body: any, joinCode: any) {
  const validation = parentStudentJoinSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.errors.map(e => e.message).join(', ') },
      { status: 400 }
    );
  }

  const { parent: parentData, student: studentData } = validation.data;
  const schoolId = joinCode.schoolId;

  if (!joinCode.class) {
    return NextResponse.json({ error: 'This join code is not linked to a class.' }, { status: 400 });
  }

  if (joinCode.class.capacity && joinCode.class._count.students >= joinCode.class.capacity) {
    return NextResponse.json({ error: 'The target class is full.' }, { status: 400 });
  }

  const existing = await prisma.auth.findFirst({
    where: { OR: [{ email: parentData.email }, { username: parentData.username }] },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email or username already exists. Please sign in instead.' },
      { status: 409 }
    );
  }

  const parentPassword = await hashPassword(parentData.password);
  const studentUsername = `${studentData.name.toLowerCase()}.${studentData.surname.toLowerCase()}.${Date.now().toString(36)}`;
  const studentPassword = await hashPassword(studentUsername);

  const result = await prisma.$transaction(async (tx) => {
    const parentAuth = await tx.auth.create({
      data: {
        email: parentData.email,
        username: parentData.username,
        password: parentPassword,
        role: 'parent',
        accountType: 'PARENT',
      },
    });

    const parentProfile = await tx.parent.create({
      data: {
        id: parentAuth.id,
        username: parentData.username,
        name: parentData.name,
        surname: parentData.surname,
        email: parentData.email,
        phone: parentData.phone || null,
        address: parentData.address,
        authId: parentAuth.id,
        schoolId,
      },
    });

    const parentMembership = await tx.schoolMembership.create({
      data: {
        authId: parentAuth.id,
        schoolId,
        role: 'parent',
        parentId: parentProfile.id,
      },
    });

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
        schoolId,
        parentId: parentProfile.id,
        classId: joinCode.class!.id,
        gradeId: joinCode.class!.gradeId,
      },
    });

    await tx.schoolMembership.create({
      data: {
        authId: studentAuth.id,
        schoolId,
        role: 'student',
        studentId: studentProfile.id,
      },
    });

    const activeAY = await tx.academicYear.findFirst({
      where: { schoolId, isArchived: false },
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

    return { parentAuth, parentMembership };
  });

  const authResult = await authenticateUser(parentData.username, parentData.password);
  if (!authResult) {
    return NextResponse.json({ error: 'Account created but automatic sign-in failed.' }, { status: 500 });
  }

  const cookieStore = await cookies();
  if (authResult.token) {
    cookieStore.set('auth_token', authResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
  }

  return NextResponse.json({
    success: true,
    message: 'Successfully joined! Welcome.',
    schoolId,
    redirect: authResult.needsSchoolSelection
      ? '/select-school'
      : `/schools/${schoolId}/parent`,
  }, { status: 201 });
}

async function handleTeacherJoin(body: any, joinCode: any) {
  const validation = teacherJoinSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.errors.map(e => e.message).join(', ') },
      { status: 400 }
    );
  }

  const { teacher: teacherData } = validation.data;
  const schoolId = joinCode.schoolId;

  if (joinCode.email && joinCode.email !== teacherData.email) {
    return NextResponse.json(
      { error: 'This invite code is restricted to a specific email address.' },
      { status: 400 }
    );
  }

  const existing = await prisma.auth.findFirst({
    where: { OR: [{ email: teacherData.email }, { username: teacherData.username }] },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email or username already exists. Please sign in instead.' },
      { status: 409 }
    );
  }

  const hashedPassword = await hashPassword(teacherData.password);

  const result = await prisma.$transaction(async (tx) => {
    const teacherAuth = await tx.auth.create({
      data: {
        email: teacherData.email,
        username: teacherData.username,
        password: hashedPassword,
        role: 'teacher',
        accountType: 'TEACHER',
      },
    });

    const teacherProfile = await tx.teacher.create({
      data: {
        id: teacherAuth.id,
        username: teacherData.username,
        name: teacherData.name,
        surname: teacherData.surname,
        email: teacherData.email,
        phone: teacherData.phone || null,
        address: teacherData.address,
        bloodType: teacherData.bloodType,
        sex: teacherData.sex,
        birthday: new Date(teacherData.birthday),
        authId: teacherAuth.id,
        schoolId,
      },
    });

    const membership = await tx.schoolMembership.create({
      data: {
        authId: teacherAuth.id,
        schoolId,
        role: 'teacher',
        teacherId: teacherProfile.id,
      },
    });

    await tx.joinCode.update({
      where: { id: joinCode.id },
      data: { currentUses: { increment: 1 } },
    });

    return { teacherAuth, membership };
  });

  const authResult = await authenticateUser(teacherData.username, teacherData.password);
  if (!authResult) {
    return NextResponse.json({ error: 'Account created but automatic sign-in failed.' }, { status: 500 });
  }

  const cookieStore = await cookies();
  if (authResult.token) {
    cookieStore.set('auth_token', authResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
  }

  return NextResponse.json({
    success: true,
    message: 'Successfully joined as a teacher!',
    schoolId,
    redirect: authResult.needsSchoolSelection
      ? '/select-school'
      : `/schools/${schoolId}/teacher`,
  }, { status: 201 });
}

async function handleParentLinkJoin(body: any, joinCode: any) {
  const parentLinkSchema = z.object({
    code: z.string().min(1),
    parent: z.object({
      name: z.string().min(1),
      surname: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      address: z.string().min(1),
      username: z.string().min(3).max(30),
      password: z.string().min(8),
    }),
  });

  const validation = parentLinkSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.errors.map(e => e.message).join(', ') },
      { status: 400 }
    );
  }

  const { parent: parentData } = validation.data;
  const schoolId = joinCode.schoolId;

  if (!joinCode.studentId) {
    return NextResponse.json({ error: 'This parent link code is not associated with a student.' }, { status: 400 });
  }

  const student = await prisma.student.findUnique({
    where: { id: joinCode.studentId },
    select: { id: true, parentId: true },
  });

  if (!student) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 400 });
  }

  const existing = await prisma.auth.findFirst({
    where: { OR: [{ email: parentData.email }, { username: parentData.username }] },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email or username already exists.' },
      { status: 409 }
    );
  }

  const hashedPassword = await hashPassword(parentData.password);

  const result = await prisma.$transaction(async (tx) => {
    const parentAuth = await tx.auth.create({
      data: {
        email: parentData.email,
        username: parentData.username,
        password: hashedPassword,
        role: 'parent',
        accountType: 'PARENT',
      },
    });

    const parentProfile = await tx.parent.create({
      data: {
        id: parentAuth.id,
        username: parentData.username,
        name: parentData.name,
        surname: parentData.surname,
        email: parentData.email,
        phone: parentData.phone || null,
        address: parentData.address,
        authId: parentAuth.id,
        schoolId,
      },
    });

    await tx.schoolMembership.create({
      data: {
        authId: parentAuth.id,
        schoolId,
        role: 'parent',
        parentId: parentProfile.id,
      },
    });

    await tx.student.update({
      where: { id: joinCode.studentId! },
      data: { parentId: parentProfile.id },
    });

    await tx.joinCode.update({
      where: { id: joinCode.id },
      data: { currentUses: { increment: 1 } },
    });

    return { parentAuth };
  });

  const authResult = await authenticateUser(parentData.username, parentData.password);
  if (!authResult) {
    return NextResponse.json({ error: 'Account created but automatic sign-in failed.' }, { status: 500 });
  }

  const cookieStore = await cookies();
  if (authResult.token) {
    cookieStore.set('auth_token', authResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
  }

  return NextResponse.json({
    success: true,
    message: 'Parent account linked to student successfully!',
    schoolId,
    redirect: `/schools/${schoolId}/parent`,
  }, { status: 201 });
}
