import type { Prisma } from "@prisma/client";
import prisma from "./prisma";

/**
 * Teachers whose home school is this school, or who have an active SchoolMembership
 * (multi-school: one Teacher row, lessons in other schools, memberships link them).
 */
export function teacherWhereInSchool(schoolId: string): Prisma.TeacherWhereInput {
  return {
    OR: [
      { schoolId },
      {
        memberships: {
          some: {
            schoolId,
            teacherId: { not: null },
            isActive: true,
          },
        },
      },
    ],
  };
}

export function teacherWhereByIdInSchool(teacherId: string, schoolId: string): Prisma.TeacherWhereInput {
  return {
    id: teacherId,
    OR: [
      { schoolId },
      {
        memberships: {
          some: {
            schoolId,
            teacherId,
            isActive: true,
          },
        },
      },
    ],
  };
}

/** Active SchoolMembership for this auth + school + session role (membership-first access). */
export async function findActiveMembership(authId: string, schoolId: string, role: string) {
  return prisma.schoolMembership.findFirst({
    where: { authId, schoolId, role, isActive: true },
  });
}

export async function userHasSchoolAccess(
  authUser: { id: string; role: string },
  schoolId: string
): Promise<boolean> {
  if (authUser.role === 'system_admin') return true;
  const m = await findActiveMembership(authUser.id, schoolId, authUser.role);
  return !!m;
}

/** Server components / actions: may this session operate in this school? */
export async function assertSchoolAccessForServerUser(
  authUser: { id: string; role: string } | null,
  schoolId: string
): Promise<boolean> {
  if (!authUser) return false;
  return userHasSchoolAccess(authUser, schoolId);
}

/** All schools where this auth user has an active membership for the given role (e.g. multi-school parent). */
export async function getActiveSchoolIdsForUser(authId: string, role: string): Promise<string[]> {
  const rows = await prisma.schoolMembership.findMany({
    where: { authId, role, isActive: true },
    select: { schoolId: true },
  });
  return Array.from(new Set(rows.map((r) => r.schoolId)));
}
