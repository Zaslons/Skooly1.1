import { NextRequest, NextResponse } from 'next/server';
import prisma from './prisma';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET_STRING = process.env.JWT_SECRET || 'your-secret-key-that-is-at-least-32-bytes-long';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent' | 'system_admin';

// Define UserIdentity for core user data
export interface UserIdentity {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  schoolId?: string;
}

export type AuthUser = {
  id: string; // This is the Auth table's ID
  schoolId?: string | null; // Made optional to correctly represent system_admin
  username: string;
  email?: string | null;
  role: UserRole;
  profileId?: string; // To store Student.id or Teacher.id if applicable
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function generateToken(userPayload: Omit<AuthUser, keyof JWTPayload>): Promise<string> {
  return await new SignJWT({ ...userPayload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
    });
    return payload as AuthUser;
  } catch (error: any) {
    console.error("[verifyToken] Error verifying token - Name:", error.name, "Message:", error.message);
    return null;
  }
}

export async function authenticateUser(identifier: string, password: string): Promise<{ user: UserIdentity; token: string } | null> {
  console.log(`[authenticateUser] Attempting to authenticate with identifier: ${identifier}`);
  let authRecord = null;

  // Rudimentary check if identifier is an email
  const isEmail = identifier.includes('@');
  console.log(`[authenticateUser] Identifier isEmail: ${isEmail}`);

  if (isEmail) {
    console.log(`[authenticateUser] Trying to find by email: ${identifier}`);
    authRecord = await prisma.auth.findUnique({
      where: { email: identifier },
    });
    console.log(`[authenticateUser] Found by email:`, authRecord);
  }

  // If not found by email, or if identifier is not an email, try by username
  if (!authRecord) {
    console.log(`[authenticateUser] Not found by email (or not an email), trying by username: ${identifier}`);
    authRecord = await prisma.auth.findUnique({
      where: { username: identifier },
    });
    console.log(`[authenticateUser] Found by username:`, authRecord);
  }

  if (!authRecord) {
    console.log(`[authenticateUser] No authRecord found for identifier: ${identifier}`);
    return null;
  }

  console.log(`[authenticateUser] AuthRecord found, comparing passwords...`);
  const isValid = await comparePasswords(password, authRecord.password);
  console.log(`[authenticateUser] Password isValid: ${isValid}`);
  if (!isValid) return null;

  // Fetch profileId if user is teacher or student
  let profileId: string | undefined = undefined;
  if (authRecord.role === 'teacher') {
    const teacherProfile = await prisma.teacher.findUnique({
      where: { authId: authRecord.id },
      select: { id: true },
    });
    profileId = teacherProfile?.id;
  } else if (authRecord.role === 'student') {
    const studentProfile = await prisma.student.findUnique({
      where: { authId: authRecord.id },
      select: { id: true },
    });
    profileId = studentProfile?.id;
  }

  // Construct the payload for the token using AuthUser structure
  const userPayloadForToken: AuthUser = {
    id: authRecord.id,
    username: authRecord.username,
    email: authRecord.email || undefined,
    role: authRecord.role as UserRole,
    schoolId: authRecord.schoolId || undefined,
    profileId: profileId,
  };

  const token = await generateToken(userPayloadForToken);
  console.log(`[authenticateUser] Authentication successful for: ${identifier}`);
  
  const clientUserResponse: UserIdentity = {
    id: authRecord.id,
    username: authRecord.username,
    email: authRecord.email || undefined,
    role: authRecord.role as UserRole,
    schoolId: authRecord.schoolId || undefined,
  };

  return { user: clientUserResponse, token };
}

export async function requireAuth(req: NextRequest): Promise<AuthUser | NextResponse> {
  const authHeader = req.headers.get('authorization');
  let token: string | undefined = authHeader?.split(' ')[1];

  if (!token) {
    token = req.cookies.get('auth_token')?.value;
  }

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await verifyToken(token);
  if (!user) {
    const response = NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    if (req.cookies.get('auth_token')?.value) {
        response.cookies.delete('auth_token');
    }
    return response;
  }
  return user;
}

export async function requireRole(req: NextRequest, roles: UserRole[]): Promise<AuthUser | NextResponse> {
  const userOrResponse = await requireAuth(req);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const user = userOrResponse;
  if (!roles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return user;
}

export async function requireSchoolAccess(req: NextRequest, schoolIdParam: string): Promise<AuthUser | NextResponse> {
  const userOrResponse = await requireAuth(req);
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  
  const user = userOrResponse;

  if (user.role === 'admin') {
    if (user.schoolId !== schoolIdParam) {
        return NextResponse.json({ error: 'Admin access denied for this school' }, { status: 403 });
    }
  } else {
    if (user.schoolId !== schoolIdParam) {
      return NextResponse.json({ error: 'Access denied for this school' }, { status: 403 });
    }
  }
  return user;
}

// New function to get current user in Server Components
export async function getCurrentUserOnPage(): Promise<AuthUser | null> {
  const cookieStore = cookies();
  const tokenValue = cookieStore.get('auth_token')?.value;

  if (!tokenValue) {
    console.log("[getCurrentUserOnPage] No auth_token cookie found.");
    return null;
  }

  try {
    const user = await verifyToken(tokenValue);
    if (!user) {
      console.log("[getCurrentUserOnPage] Token verification failed or returned null.");
      // Optionally, could clear the cookie here if it's invalid, but that's tricky in RSCs
      // Best to handle redirection on the page if user is null and page requires auth.
    }
    return user;
  } catch (error) {
    console.error("[getCurrentUserOnPage] Error during token verification:", error);
    return null;
  }
} 