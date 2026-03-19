import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';

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

    const { user, token, needsSchoolSelection, memberships } = authResult;

    const response = NextResponse.json({
      message: 'Sign-in successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        accountType: user.accountType,
      },
      token,
      needsSchoolSelection,
      memberships,
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('Sign-in error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
