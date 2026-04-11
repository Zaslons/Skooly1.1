import { NextRequest, NextResponse } from "next/server";
import { LessonDeliveryMode } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";

const TAKE = 25;

/**
 * E7: admin-only read of recent scheduling audit rows (generation, recurring commit, instance overrides).
 */
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
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }

  try {
    const [school, termGenerations, recurringCommits, lessonOverrides, exceptionAudits, exceptionTypeCounts] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true, schedulingPipelineEnabled: true },
      }),
      prisma.termScheduleGenerationLog.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: {
          id: true,
          termId: true,
          requestId: true,
          idempotencyKey: true,
          mode: true,
          scopeType: true,
          scopeGradeId: true,
          scopeClassId: true,
          durationMs: true,
          success: true,
          errorCode: true,
          createdAt: true,
        },
      }),
      prisma.recurringExamCommitLog.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: {
          id: true,
          termId: true,
          requestId: true,
          durationMs: true,
          success: true,
          examsCreated: true,
          errorCode: true,
          summaryJson: true,
          createdAt: true,
        },
      }),
      prisma.lessonSessionOverrideAudit.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: {
          id: true,
          lessonSessionId: true,
          actorAuthId: true,
          createdAt: true,
        },
      }),
      prisma.calendarExceptionAudit.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        select: {
          id: true,
          termId: true,
          exceptionId: true,
          actorAuthId: true,
          operation: true,
          createdAt: true,
        },
      }),
      prisma.schoolCalendarException.groupBy({
        by: ["type"],
        where: { schoolId },
        _count: { _all: true },
      }),
    ]);

    const latestExceptionConflicts = recurringCommits
      .map((row) => {
        try {
          const parsed = JSON.parse((row as unknown as { summaryJson?: string }).summaryJson ?? "{}") as {
            summary?: { conflictReasons?: Record<string, number> };
          };
          const reasons = parsed.summary?.conflictReasons ?? {};
          const exceptionReasons = Object.entries(reasons).filter(([k]) => k.startsWith("EXCEPTION_"));
          if (exceptionReasons.length === 0) return null;
          return {
            commitId: row.id,
            createdAt: row.createdAt,
            reasons: Object.fromEntries(exceptionReasons),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(0, 10);

    const [lessonDurationRows, onlineMissingUrl] = await Promise.all([
      prisma.lesson.findMany({
        where: { schoolId },
        select: { deliveryMode: true, startTime: true, endTime: true },
      }),
      prisma.lesson.findMany({
        where: {
          schoolId,
          deliveryMode: LessonDeliveryMode.ONLINE,
          meetingUrl: null,
        },
        select: {
          id: true,
          name: true,
          day: true,
          teacher: { select: { id: true, name: true, surname: true } },
          class: { select: { id: true, name: true } },
          subject: { select: { name: true } },
        },
        orderBy: [{ teacherId: "asc" }, { day: "asc" }, { id: "asc" }],
        take: 200,
      }),
    ]);

    let weeklyTemplateMinutesOnline = 0;
    let weeklyTemplateMinutesInPerson = 0;
    for (const row of lessonDurationRows) {
      const mins = Math.max(
        0,
        (row.endTime.getTime() - row.startTime.getTime()) / 60_000
      );
      if (row.deliveryMode === LessonDeliveryMode.ONLINE) {
        weeklyTemplateMinutesOnline += mins;
      } else {
        weeklyTemplateMinutesInPerson += mins;
      }
    }

    return NextResponse.json(
      {
        schoolId,
        schedulingPipelineEnabled: school?.schedulingPipelineEnabled !== false,
        termGenerations,
        recurringCommits,
        lessonOverrides,
        exceptionAudits,
        exceptionTypeCounts: exceptionTypeCounts.map((r) => ({ type: r.type, count: r._count._all })),
        latestExceptionConflicts,
        weeklyTemplateMinutes: {
          online: Math.round(weeklyTemplateMinutesOnline * 100) / 100,
          inPerson: Math.round(weeklyTemplateMinutesInPerson * 100) / 100,
        },
        onlineWeeklyTemplatesMissingUrl: onlineMissingUrl.map((l) => ({
          lessonId: l.id,
          name: l.name,
          day: l.day,
          teacher: `${l.teacher.name} ${l.teacher.surname}`,
          teacherId: l.teacher.id,
          className: l.class.name,
          classId: l.class.id,
          subjectName: l.subject.name,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[SCHEDULING_DIAGNOSTICS_GET]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}
