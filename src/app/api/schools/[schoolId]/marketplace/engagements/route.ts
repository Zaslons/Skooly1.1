import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  const { schoolId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await assertSchoolAccessForServerUser(user, schoolId)))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const engagements = await prisma.marketplaceEngagement.findMany({
    where: { schoolId },
    include: {
      teacher: { select: { id: true, name: true, surname: true, img: true } },
      reviews: { select: { reviewerRole: true, rating: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ engagements });
}
