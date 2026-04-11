import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";

export async function GET() {
  const user = await getServerUser();

  let teacherId: string | null = null;
  let teacherSubjects: string[] = [];

  if (user?.role === "teacher") {
    const teacher = await prisma.teacher.findUnique({
      where: { authId: user.id },
      select: {
        id: true,
        marketplaceProfile: { select: { subjectTags: true } },
      },
    });
    teacherId = teacher?.id ?? null;
    teacherSubjects = teacher?.marketplaceProfile?.subjectTags ?? [];
  }

  const where: any = {
    isActive: true,
    school: { marketplaceSettings: { isEnabled: true } },
  };

  if (teacherId && teacherSubjects.length > 0) {
    where.subjectTags = { hasSome: teacherSubjects };
  }

  const needs = await prisma.schoolMarketplaceNeed.findMany({
    where,
    include: {
      school: { select: { id: true, name: true, country: true } },
      _count: { select: { applications: true } },
      ...(teacherId
        ? {
            applications: {
              where: { teacherId },
              select: { id: true, status: true },
              take: 1,
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const result = needs.map((n) => ({
    ...n,
    applicantCount: n._count.applications,
    myApplication: (n as any).applications?.[0] ?? null,
    _count: undefined,
    applications: undefined,
  }));

  return NextResponse.json({ needs: result });
}
