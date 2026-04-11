'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getServerUser } from '@/lib/auth';
import { userHasSchoolAccess } from '@/lib/schoolAccess';
import crypto from 'crypto';

function generateCode(length = 8): string {
  return crypto.randomBytes(length).toString('hex').substring(0, length).toUpperCase();
}

export async function createJoinCodeAction(data: {
  schoolId: string;
  type: 'CLASS_STUDENT' | 'TEACHER_INVITE' | 'PARENT_LINK';
  classId?: number;
  studentId?: string;
  email?: string;
  maxUses?: number;
  expiresInDays?: number;
}) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.schoolId !== data.schoolId || currentUser.role !== 'admin') {
    return { success: false, message: 'Unauthorized.' };
  }

  try {
    const code = generateCode();
    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const joinCode = await prisma.joinCode.create({
      data: {
        code,
        schoolId: data.schoolId,
        type: data.type,
        classId: data.classId ?? null,
        studentId: data.studentId ?? null,
        email: data.email ?? null,
        maxUses: data.maxUses ?? null,
        expiresAt,
        createdBy: currentUser.id,
      },
    });

    revalidatePath(`/schools/${data.schoolId}/admin/join-codes`);

    return { success: true, message: 'Join code created.', joinCode };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to create join code.' };
  }
}

export async function deactivateJoinCodeAction(joinCodeId: string, schoolId: string) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: 'Unauthorized.' };
  }

  try {
    await prisma.joinCode.update({
      where: { id: joinCodeId },
      data: { isActive: false },
    });

    revalidatePath(`/schools/${schoolId}/admin/join-codes`);
    return { success: true, message: 'Join code deactivated.' };
  } catch {
    return { success: false, message: 'Failed to deactivate join code.' };
  }
}

export async function getSchoolJoinCodes(schoolId: string) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return [];
  }

  return prisma.joinCode.findMany({
    where: { schoolId },
    include: { class: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function validateJoinCode(code: string) {
  const joinCode = await prisma.joinCode.findUnique({
    where: { code },
    include: {
      school: { select: { id: true, name: true } },
      class: { select: { id: true, name: true, gradeId: true, grade: { select: { level: true } } } },
    },
  });

  if (!joinCode) {
    return { valid: false, message: 'Invalid join code.' };
  }

  if (!joinCode.isActive) {
    return { valid: false, message: 'This join code has been deactivated.' };
  }

  if (joinCode.expiresAt && joinCode.expiresAt < new Date()) {
    return { valid: false, message: 'This join code has expired.' };
  }

  if (joinCode.maxUses && joinCode.currentUses >= joinCode.maxUses) {
    return { valid: false, message: 'This join code has reached its maximum uses.' };
  }

  return {
    valid: true,
    joinCode: {
      id: joinCode.id,
      type: joinCode.type,
      school: joinCode.school,
      class: joinCode.class,
      studentId: joinCode.studentId,
    },
  };
}
