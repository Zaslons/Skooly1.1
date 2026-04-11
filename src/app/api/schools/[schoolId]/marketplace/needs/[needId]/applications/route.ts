import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ schoolId: string; needId: string }> }
) {
  const { schoolId, needId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await assertSchoolAccessForServerUser(user, schoolId)))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const need = await prisma.schoolMarketplaceNeed.findUnique({
    where: { id: needId },
    select: { schoolId: true },
  });
  if (!need || need.schoolId !== schoolId) {
    return NextResponse.json({ error: "Need not found" }, { status: 404 });
  }

  const applications = await prisma.marketplaceApplication.findMany({
    where: { needId },
    include: {
      teacher: {
        select: {
          id: true,
          name: true,
          surname: true,
          img: true,
          marketplaceProfile: {
            select: {
              headline: true,
              subjectTags: true,
              hourlyRate: true,
              currency: true,
              city: true,
              yearsOfExp: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ applications });
}
