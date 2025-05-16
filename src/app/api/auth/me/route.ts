import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import prisma from '@/lib/prisma'; // Import Prisma client

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const decodedUser = await verifyToken(token); // This is the raw payload from JWT
    if (!decodedUser) {
      // This case might happen if the token is malformed or the secret is wrong
      // or if verifyToken itself has an issue.
      // Delete the invalid cookie
      const response = NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      response.cookies.delete('auth_token');
      return response;
    }

    // Construct the base AuthUser object
    let authUser: AuthUser = {
        id: decodedUser.id,
        schoolId: decodedUser.schoolId, // This can be string | null | undefined
        username: decodedUser.username,
        email: decodedUser.email,
        role: decodedUser.role,
    };

    // Only attempt to fetch profileId if schoolId exists and role is teacher or student
    if (authUser.schoolId && typeof authUser.schoolId === 'string') {
      if (authUser.role === 'teacher') {
        const teacherProfile = await prisma.teacher.findUnique({
          where: { authId: authUser.id, schoolId: authUser.schoolId }, // authUser.schoolId is a string here
          select: { id: true },
        });
        if (teacherProfile) {
          authUser.profileId = teacherProfile.id;
        }
      } else if (authUser.role === 'student') {
        const studentProfile = await prisma.student.findUnique({
          where: { authId: authUser.id, schoolId: authUser.schoolId }, // authUser.schoolId is a string here
          select: { id: true },
        });
        if (studentProfile) {
          authUser.profileId = studentProfile.id;
        }
      }
    } else {
      if (authUser.role === 'teacher' || authUser.role === 'student') {
        console.warn(`[API /auth/me] User ${authUser.id} (${authUser.role}) has no valid schoolId in token. Cannot fetch profileId.`);
      }
    }

    return NextResponse.json(authUser);
  } catch (error) {
    // This catches errors during token verification, e.g., signature failure
    console.error('[API /auth/me] Error processing token or fetching profile:', error);
    const response = NextResponse.json({ error: 'Token processing failed' }, { status: 401 });
    response.cookies.delete('auth_token');
    return response;
  }
} 