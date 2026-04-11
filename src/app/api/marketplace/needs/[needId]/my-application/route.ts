import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ needId: string }> }
) {
  const { needId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "teacher") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const teacher = await prisma.teacher.findUnique({
    where: { authId: user.id },
    select: { id: true },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

  const application = await prisma.marketplaceApplication.findUnique({
    where: { needId_teacherId: { needId, teacherId: teacher.id } },
    select: { id: true, status: true, message: true, createdAt: true },
  });

  return NextResponse.json({ application: application ?? null });
}
