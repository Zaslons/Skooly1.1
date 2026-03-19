import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const decodedUser = await verifyToken(token);
    if (!decodedUser) {
      const response = NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      response.cookies.delete('auth_token');
      return response;
    }

    const authUser: AuthUser = {
      id: decodedUser.id,
      schoolId: decodedUser.schoolId,
      username: decodedUser.username,
      email: decodedUser.email,
      role: decodedUser.role,
      profileId: decodedUser.profileId,
      accountType: decodedUser.accountType,
      membershipId: decodedUser.membershipId,
    };

    if (authUser.schoolId && typeof authUser.schoolId === 'string' && !authUser.profileId) {
      if (authUser.role === 'teacher') {
        const teacherProfile = await prisma.teacher.findFirst({
          where: { authId: authUser.id, schoolId: authUser.schoolId },
          select: { id: true },
        });
        if (teacherProfile) authUser.profileId = teacherProfile.id;
      } else if (authUser.role === 'student') {
        const studentProfile = await prisma.student.findFirst({
          where: { authId: authUser.id, schoolId: authUser.schoolId },
          select: { id: true },
        });
        if (studentProfile) authUser.profileId = studentProfile.id;
      }
    }

    const memberships = await prisma.schoolMembership.findMany({
      where: { authId: authUser.id, isActive: true },
      include: { school: { select: { name: true } } },
    });

    return NextResponse.json({
      ...authUser,
      memberships: memberships.map(m => ({
        id: m.id,
        schoolId: m.schoolId,
        schoolName: m.school.name,
        role: m.role,
        isActive: m.isActive,
      })),
    });
  } catch (error) {
    console.error('[API /auth/me] Error:', error);
    const response = NextResponse.json({ error: 'Token processing failed' }, { status: 401 });
    response.cookies.delete('auth_token');
    return response;
  }
}
