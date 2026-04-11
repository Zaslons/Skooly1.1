import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import { getCalendarInstancesForRange } from "@/lib/domain/calendarInstances";

export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const { schoolId } = params;
  if (!schoolId) {
    return NextResponse.json({ code: "SCHOOL_ID_REQUIRED", error: "School ID is required." }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;

  const { searchParams } = new URL(request.url);
  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");
  if (!startRaw || !endRaw) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "Query params start and end (ISO date strings) are required." },
      { status: 400 }
    );
  }

  const rangeStart = new Date(startRaw);
  const rangeEnd = new Date(endRaw);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "Invalid start or end date." }, { status: 400 });
  }

  const teacherId = searchParams.get("teacherId") ?? undefined;
  const classIdRaw = searchParams.get("classId");
  const classId = classIdRaw ? Number.parseInt(classIdRaw, 10) : undefined;

  if (user.role === "teacher" && user.profileId) {
    const events = await getCalendarInstancesForRange({
      schoolId,
      rangeStart,
      rangeEnd,
      teacherId: user.profileId,
      classId: Number.isFinite(classId) ? classId : undefined,
    });
    return NextResponse.json({ events }, { status: 200 });
  }

  if (user.role === "student" && user.profileId) {
    const student = await prisma.student.findFirst({
      where: { id: user.profileId, schoolId },
      select: { classId: true },
    });
    if (!student) {
      return NextResponse.json({ code: "FORBIDDEN", error: "Student not found." }, { status: 403 });
    }
    if (student.classId == null) {
      return NextResponse.json({ events: [] }, { status: 200 });
    }
    const events = await getCalendarInstancesForRange({
      schoolId,
      rangeStart,
      rangeEnd,
      classId: student.classId,
    });
    return NextResponse.json({ events }, { status: 200 });
  }

  if (user.role === "parent" && user.profileId) {
    if (!Number.isFinite(classId)) {
      return NextResponse.json(
        { code: "INVALID_INPUT", error: "Parent calendar requires classId query param." },
        { status: 400 }
      );
    }
    const childInClass = await prisma.student.findFirst({
      where: { parentId: user.profileId, schoolId, classId },
      select: { id: true },
    });
    if (!childInClass) {
      return NextResponse.json({ code: "FORBIDDEN", error: "Not allowed for this class." }, { status: 403 });
    }
    const events = await getCalendarInstancesForRange({
      schoolId,
      rangeStart,
      rangeEnd,
      classId,
    });
    return NextResponse.json({ events }, { status: 200 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Not allowed to view this calendar." }, { status: 403 });
  }

  const events = await getCalendarInstancesForRange({
    schoolId,
    rangeStart,
    rangeEnd,
    teacherId,
    classId: Number.isFinite(classId) ? classId : undefined,
  });

  return NextResponse.json({ events }, { status: 200 });
}
