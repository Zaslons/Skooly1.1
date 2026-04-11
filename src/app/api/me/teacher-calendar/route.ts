import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCalendarInstancesForRange, type CalendarInstanceEventDTO } from "@/lib/domain/calendarInstances";

/**
 * Merged lesson/exam calendar for the logged-in teacher across all active teacher memberships.
 * Optional `schoolId` filters to one school (must still be an active membership).
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await verifyToken(token);
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");
  const filterSchoolId = searchParams.get("schoolId") ?? undefined;

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

  const memberships = await prisma.schoolMembership.findMany({
    where: {
      authId: user.id,
      role: "teacher",
      isActive: true,
      ...(filterSchoolId ? { schoolId: filterSchoolId } : {}),
    },
    include: {
      school: { select: { id: true, name: true } },
    },
  });

  if (memberships.length === 0) {
    return NextResponse.json({ events: [] }, { status: 200 });
  }

  const merged: CalendarInstanceEventDTO[] = [];

  for (const m of memberships) {
    if (!m.teacherId) continue;

    const schoolName = m.school.name;
    const schoolId = m.schoolId;

    const slice = await getCalendarInstancesForRange({
      schoolId,
      rangeStart,
      rangeEnd,
      teacherId: m.teacherId,
    });

    for (const ev of slice) {
      const schoolTag = `[${schoolName}]`;
      const title = `${schoolTag} ${ev.title}`;

      merged.push({
        ...ev,
        title,
        extendedProps: {
          ...ev.extendedProps,
          schoolId,
          schoolName,
          membershipId: m.id,
        },
      });
    }
  }

  merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return NextResponse.json({ events: merged }, { status: 200 });
}
