import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "teacher") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const teacher = await prisma.teacher.findUnique({
    where: { authId: user.id },
    select: { id: true },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

  const engagements = await prisma.marketplaceEngagement.findMany({
    where: { teacherId: teacher.id },
    include: {
      school: { select: { id: true, name: true } },
      reviews: { select: { reviewerRole: true, rating: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ engagements });
}
