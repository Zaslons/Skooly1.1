import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: { schoolId: string } }) {
  const { schoolId } = params;
  if (!schoolId) {
    return NextResponse.json({ code: "SCHOOL_ID_REQUIRED", error: "School ID is required." }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }

  const templates = await prisma.timetableGradeTemplate.findMany({
    where: { schoolId },
    select: { gradeId: true, updatedAt: true },
    orderBy: { gradeId: "asc" },
  });

  return NextResponse.json({ templates }, { status: 200 });
}
