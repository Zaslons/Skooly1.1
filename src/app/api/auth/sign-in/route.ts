import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import prisma from '@/lib/prisma'; // Changed to default import

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json({ message: 'Email/Username and password are required' }, { status: 400 });
    }

    const authResult = await authenticateUser(identifier, password);

    if (!authResult) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const { user, token } = authResult;

    // Fetch the full user details based on the role and authId
    let userDetails: any = null;
    if (user.role === 'admin' && user.id) {
      userDetails = await prisma.admin.findUnique({ where: { authId: user.id } });
    } else if (user.role === 'teacher' && user.id) {
      userDetails = await prisma.teacher.findUnique({ where: { authId: user.id } });
    } else if (user.role === 'student' && user.id) {
      userDetails = await prisma.student.findUnique({ where: { authId: user.id } });
    } else if (user.role === 'parent' && user.id) {
      userDetails = await prisma.parent.findUnique({ where: { authId: user.id } });
    }

    const response = NextResponse.json({
      message: 'Sign-in successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        profileId: userDetails?.id,
      },
      token,
    });

    // Set HttpOnly cookie
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax', // Or 'strict'
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    return response;
  } catch (error) {
    console.error('Sign-in error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
} 