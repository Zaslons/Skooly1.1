import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { lessonSessionInstancePatchSchema } from "@/lib/formValidationSchemas";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import { LessonSessionStatus } from "@prisma/client";
import { logSchedulingEvent } from "@/lib/schedulingLogger";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { schoolId: string; sessionId: string } }
) {
  const { schoolId, sessionId } = params;
  const sessionIdNum = Number.parseInt(sessionId, 10);

  if (!schoolId || Number.isNaN(sessionIdNum)) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "Invalid school or session id." }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = lessonSessionInstancePatchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const existing = await prisma.lessonSession.findFirst({
    where: { id: sessionIdNum, schoolId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ code: "NOT_FOUND", error: "Lesson session not found." }, { status: 404 });
  }

  const data = parsed.data;

  if (data.substituteTeacherId) {
    const t = await prisma.teacher.findFirst({
      where: { id: data.substituteTeacherId, schoolId },
      select: { id: true },
    });
    if (!t) {
      return NextResponse.json({ code: "INVALID_TEACHER", error: "Substitute teacher not in this school." }, { status: 400 });
    }
  }

  if (data.overrideRoomId) {
    const r = await prisma.room.findFirst({
      where: { id: data.overrideRoomId, schoolId },
      select: { id: true },
    });
    if (!r) {
      return NextResponse.json({ code: "INVALID_ROOM", error: "Room not in this school." }, { status: 400 });
    }
  }

  if (data.startTime && data.endTime && data.endTime <= data.startTime) {
    return NextResponse.json({ code: "INVALID_RANGE", error: "endTime must be after startTime." }, { status: 400 });
  }

  const now = new Date();

  const updated = await prisma.lessonSession.update({
    where: { id: sessionIdNum },
    data: {
      ...(data.status ? { status: data.status as LessonSessionStatus } : {}),
      ...(data.substituteTeacherId !== undefined
        ? { substituteTeacherId: data.substituteTeacherId }
        : {}),
      ...(data.overrideRoomId !== undefined ? { overrideRoomId: data.overrideRoomId } : {}),
      ...(data.instanceNotes !== undefined ? { instanceNotes: data.instanceNotes } : {}),
      ...(data.lastOverrideReason !== undefined ? { lastOverrideReason: data.lastOverrideReason } : {}),
      lastOverrideAt: now,
      ...(data.startTime ? { startTime: data.startTime } : {}),
      ...(data.endTime ? { endTime: data.endTime } : {}),
      ...(data.meetingUrl !== undefined ? { meetingUrl: data.meetingUrl } : {}),
      ...(data.meetingLabel !== undefined ? { meetingLabel: data.meetingLabel } : {}),
    },
    include: {
      subject: { select: { name: true } },
      class: { select: { name: true } },
      teacher: { select: { id: true, name: true, surname: true } },
      substituteTeacher: { select: { id: true, name: true, surname: true } },
      room: { select: { id: true, name: true } },
      overrideRoom: { select: { id: true, name: true } },
    },
  });

  const patchPayload = { ...parsed.data };
  await prisma.lessonSessionOverrideAudit
    .create({
      data: {
        schoolId,
        lessonSessionId: sessionIdNum,
        actorAuthId: user.id,
        patchJson: JSON.stringify(patchPayload),
      },
    })
    .catch(() => {
      /* best-effort audit */
    });

  logSchedulingEvent({
    op: "LESSON_SESSION_OVERRIDE",
    schoolId,
    lessonSessionId: sessionIdNum,
    actorAuthId: user.id,
    patchKeys: Object.keys(patchPayload),
  });

  return NextResponse.json({ session: updated }, { status: 200 });
}
