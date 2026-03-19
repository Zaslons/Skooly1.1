import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, selectSchoolMembership } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { membershipId } = await req.json();
    if (!membershipId) {
      return NextResponse.json({ error: 'membershipId is required' }, { status: 400 });
    }

    const newToken = await selectSchoolMembership(user.id, membershipId);
    if (!newToken) {
      return NextResponse.json({ error: 'Membership not found or not active' }, { status: 404 });
    }

    const response = NextResponse.json({ message: 'School selected successfully' });
    response.cookies.set('auth_token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('Select school error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
