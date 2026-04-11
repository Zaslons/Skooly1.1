import { NextRequest, NextResponse } from 'next/server';
import prisma from './prisma';
import { findActiveMembership } from './schoolAccess';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET_STRING = process.env.JWT_SECRET;
if (!JWT_SECRET_STRING) {
  throw new Error('JWT_SECRET environment variable is required but was not set.');
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent' | 'system_admin';

export interface UserIdentity {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  schoolId?: string;
  accountType?: string;
  memberships?: MembershipInfo[];
}

export interface MembershipInfo {
  id: string;
  schoolId: string;
  schoolName: string;
  role: string;
  isActive: boolean;
  profileId?: string;
}

export type AuthUser = {
  id: string;
  schoolId?: string | null;
  username: string;
  email?: string | null;
  role: UserRole;
  profileId?: string;
  accountType?: string;
  membershipId?: string;
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
    const { payload } = await jwtVerify(token, JWT_SECRET, {});
    return payload as AuthUser;
  } catch {
    return null;
  }
}

async function getProfileId(authId: string, role: string, schoolId?: string): Promise<string | undefined> {
  if (role === 'teacher') {
    const profile = await prisma.teacher.findFirst({
      where: { authId, ...(schoolId ? { schoolId } : {}) },
      select: { id: true },
    });
    return profile?.id ?? (await prisma.teacher.findFirst({ where: { authId }, select: { id: true } }))?.id;
  }
  if (role === 'student') {
    const profile = await prisma.student.findFirst({
      where: { authId, ...(schoolId ? { schoolId } : {}) },
      select: { id: true },
    });
    return profile?.id ?? (await prisma.student.findFirst({ where: { authId }, select: { id: true } }))?.id;
  }
  if (role === 'admin') {
    return (await prisma.admin.findFirst({ where: { authId }, select: { id: true } }))?.id;
  }
  if (role === 'parent') {
    return (await prisma.parent.findFirst({ where: { authId }, select: { id: true } }))?.id;
  }
  return undefined;
}

/** Create SchoolMembership rows from existing profile rows when none exist (upgrade / legacy). */
async function ensureMembershipsFromProfiles(authId: string): Promise<void> {
  const existing = await prisma.schoolMembership.count({ where: { authId } });
  if (existing > 0) return;

  const auth = await prisma.auth.findUnique({
    where: { id: authId },
    include: { admin: true, teacher: true, student: true, parent: true },
  });
  if (!auth) return;

  try {
    if (auth.admin) {
      await prisma.schoolMembership.create({
        data: {
          authId,
          schoolId: auth.admin.schoolId,
          role: 'admin',
          adminId: auth.admin.id,
        },
      });
      return;
    }
    if (auth.teacher?.schoolId) {
      await prisma.schoolMembership.create({
        data: {
          authId,
          schoolId: auth.teacher.schoolId,
          role: 'teacher',
          teacherId: auth.teacher.id,
        },
      });
      return;
    }
    if (auth.student) {
      await prisma.schoolMembership.create({
        data: {
          authId,
          schoolId: auth.student.schoolId,
          role: 'student',
          studentId: auth.student.id,
        },
      });
      return;
    }
    if (auth.parent?.schoolId) {
      await prisma.schoolMembership.create({
        data: {
          authId,
          schoolId: auth.parent.schoolId,
          role: 'parent',
          parentId: auth.parent.id,
        },
      });
    }
  } catch {
    // Unique / partial-index races: ignore; login will retry with findMany
  }
}

export type AuthenticateResult = {
  user: UserIdentity;
  token: string;
  needsSchoolSelection: boolean;
  memberships: MembershipInfo[];
};

export async function authenticateUser(identifier: string, password: string): Promise<AuthenticateResult | null> {
  let authRecord = null;

  const isEmail = identifier.includes('@');

  if (isEmail) {
    authRecord = await prisma.auth.findUnique({
      where: { email: identifier },
    });
  }

  if (!authRecord) {
    authRecord = await prisma.auth.findUnique({
      where: { username: identifier },
    });
  }

  if (!authRecord) {
    return null;
  }

  const isValid = await comparePasswords(password, authRecord.password);
  if (!isValid) return null;

  if (authRecord.role !== 'system_admin') {
    await ensureMembershipsFromProfiles(authRecord.id);
  }

  const memberships = await prisma.schoolMembership.findMany({
    where: { authId: authRecord.id, isActive: true },
    include: {
      school: { select: { name: true } },
      admin: { select: { id: true } },
      teacher: { select: { id: true } },
      student: { select: { id: true } },
      parent: { select: { id: true } },
    },
  });

  const membershipInfos: MembershipInfo[] = memberships.map(m => ({
    id: m.id,
    schoolId: m.schoolId,
    schoolName: m.school.name,
    role: m.role,
    isActive: m.isActive,
    profileId: m.admin?.id || m.teacher?.id || m.student?.id || m.parent?.id,
  }));

  if (authRecord.role === 'system_admin') {
    const tokenPayload: AuthUser = {
      id: authRecord.id,
      username: authRecord.username,
      email: authRecord.email || undefined,
      role: 'system_admin',
      accountType: authRecord.accountType,
    };

    const token = await generateToken(tokenPayload);
    return {
      user: {
        id: authRecord.id,
        username: authRecord.username,
        email: authRecord.email || undefined,
        role: 'system_admin',
        accountType: authRecord.accountType,
        memberships: membershipInfos,
      },
      token,
      needsSchoolSelection: false,
      memberships: membershipInfos,
    };
  }

  if (memberships.length === 0) {
    return null;
  }

  if (memberships.length === 1) {
    const m = memberships[0];
    const profileId = m.admin?.id || m.teacher?.id || m.student?.id || m.parent?.id;
    const role = m.role as UserRole;

    const tokenPayload: AuthUser = {
      id: authRecord.id,
      username: authRecord.username,
      email: authRecord.email || undefined,
      role,
      schoolId: m.schoolId,
      profileId,
      accountType: authRecord.accountType,
      membershipId: m.id,
    };

    const token = await generateToken(tokenPayload);
    return {
      user: {
        id: authRecord.id,
        username: authRecord.username,
        email: authRecord.email || undefined,
        role,
        schoolId: m.schoolId,
        accountType: authRecord.accountType,
        memberships: membershipInfos,
      },
      token,
      needsSchoolSelection: false,
      memberships: membershipInfos,
    };
  }

  const firstMembership = memberships[0];
  const firstProfileId = firstMembership.admin?.id || firstMembership.teacher?.id || firstMembership.student?.id || firstMembership.parent?.id;
  const tokenPayload: AuthUser = {
    id: authRecord.id,
    username: authRecord.username,
    email: authRecord.email || undefined,
    role: firstMembership.role as UserRole,
    schoolId: firstMembership.schoolId,
    profileId: firstProfileId,
    accountType: authRecord.accountType,
    membershipId: firstMembership.id,
  };

  const token = await generateToken(tokenPayload);
  return {
    user: {
      id: authRecord.id,
      username: authRecord.username,
      email: authRecord.email || undefined,
      role: firstMembership.role as UserRole,
      schoolId: firstMembership.schoolId,
      accountType: authRecord.accountType,
      memberships: membershipInfos,
    },
    token,
    needsSchoolSelection: memberships.length > 1,
    memberships: membershipInfos,
  };
}

export async function selectSchoolMembership(authId: string, membershipId: string): Promise<string | null> {
  const membership = await prisma.schoolMembership.findFirst({
    where: { id: membershipId, authId, isActive: true },
    include: {
      school: { select: { name: true } },
      admin: { select: { id: true } },
      teacher: { select: { id: true } },
      student: { select: { id: true } },
      parent: { select: { id: true } },
    },
  });

  if (!membership) return null;

  const auth = await prisma.auth.findUnique({
    where: { id: authId },
    select: { username: true, email: true, accountType: true },
  });

  if (!auth) return null;

  const profileId = membership.admin?.id || membership.teacher?.id || membership.student?.id || membership.parent?.id;

  const tokenPayload: AuthUser = {
    id: authId,
    username: auth.username,
    email: auth.email || undefined,
    role: membership.role as UserRole,
    schoolId: membership.schoolId,
    profileId,
    accountType: auth.accountType,
    membershipId: membership.id,
  };

  return generateToken(tokenPayload);
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

  if (user.role === 'system_admin') {
    return user;
  }

  const membership = await findActiveMembership(user.id, schoolIdParam, user.role);
  if (!membership) {
    return NextResponse.json({ error: 'Access denied for this school' }, { status: 403 });
  }
  return user;
}

export async function getServerUser(): Promise<AuthUser | null> {
  const cookieStore = cookies();
  const tokenValue = cookieStore.get('auth_token')?.value;

  if (!tokenValue) {
    return null;
  }

  try {
    return await verifyToken(tokenValue);
  } catch {
    return null;
  }
}
