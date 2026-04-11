import { NextRequest, NextResponse } from "next/server";
import { CalendarExceptionType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import {
  assertCalendarExceptionWithinTerm,
  TemporalRuleError,
} from "@/lib/domain/temporalRules";
import { schoolCalendarExceptionUpdateSchema } from "@/lib/formValidationSchemas";

async function loadTerm(schoolId: string, termId: string) {
  return prisma.term.findFirst({
    where: { id: termId, schoolId },
    select: { id: true, startDate: true, endDate: true, isArchived: true },
  });
}

async function guardAdminAccess(request: NextRequest, schoolId: string) {
  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }
  return user;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { schoolId: string; termId: string; exceptionId: string } }
) {
  const { schoolId, termId, exceptionId } = params;
  if (!schoolId || !termId || !exceptionId) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "schoolId, termId and exceptionId are required." },
      { status: 400 }
    );
  }

  const adminOrResponse = await guardAdminAccess(request, schoolId);
  if (adminOrResponse instanceof NextResponse) return adminOrResponse;
  const actorAuthId = adminOrResponse.id ?? null;

  try {
    const term = await loadTerm(schoolId, termId);
    if (!term) {
      return NextResponse.json({ code: "TERM_NOT_FOUND", error: "Term not found." }, { status: 404 });
    }
    if (term.isArchived) {
      return NextResponse.json(
        { code: "TERM_ARCHIVED", error: "Cannot edit calendar exceptions on an archived term." },
        { status: 400 }
      );
    }

    const existing = await prisma.schoolCalendarException.findFirst({
      where: { id: exceptionId, schoolId, termId },
    });
    if (!existing) {
      return NextResponse.json(
        { code: "CALENDAR_EXCEPTION_NOT_FOUND", error: "Calendar exception not found." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validated = schoolCalendarExceptionUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          code: "INVALID_INPUT",
          error: "Invalid input",
          fieldErrors: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const nextStartDate = validated.data.startDate ?? existing.startDate;
    const nextEndDate = validated.data.endDate ?? existing.endDate;
    assertCalendarExceptionWithinTerm({
      termStartDate: term.startDate,
      termEndDate: term.endDate,
      exceptionStart: nextStartDate,
      exceptionEnd: nextEndDate,
    });

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.schoolCalendarException.update({
        where: { id: exceptionId },
        data: {
          title: validated.data.title ?? existing.title,
          type: validated.data.type ?? existing.type,
          startDate: nextStartDate,
          endDate: nextEndDate,
          notes: validated.data.notes === undefined ? existing.notes : validated.data.notes,
        },
      });
      await tx.calendarExceptionAudit.create({
        data: {
          schoolId,
          termId,
          exceptionId,
          actorAuthId,
          operation: "UPDATE",
          beforeJson: JSON.stringify(existing),
          afterJson: JSON.stringify(row),
        },
      });
      return row;
    });

    return NextResponse.json({ exception: updated }, { status: 200 });
  } catch (err) {
    if (err instanceof TemporalRuleError) {
      return NextResponse.json(
        { code: err.code, error: err.message, fieldErrors: err.fieldErrors },
        { status: 400 }
      );
    }
    console.error("[CALENDAR_EXCEPTIONS_PATCH]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { schoolId: string; termId: string; exceptionId: string } }
) {
  const { schoolId, termId, exceptionId } = params;
  if (!schoolId || !termId || !exceptionId) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "schoolId, termId and exceptionId are required." },
      { status: 400 }
    );
  }

  const adminOrResponse = await guardAdminAccess(request, schoolId);
  if (adminOrResponse instanceof NextResponse) return adminOrResponse;
  const actorAuthId = adminOrResponse.id ?? null;

  try {
    const term = await loadTerm(schoolId, termId);
    if (!term) {
      return NextResponse.json({ code: "TERM_NOT_FOUND", error: "Term not found." }, { status: 404 });
    }
    if (term.isArchived) {
      return NextResponse.json(
        { code: "TERM_ARCHIVED", error: "Cannot delete calendar exceptions on an archived term." },
        { status: 400 }
      );
    }

    const existing = await prisma.schoolCalendarException.findFirst({
      where: { id: exceptionId, schoolId, termId },
      select: { id: true, type: true },
    });
    if (!existing) {
      return NextResponse.json(
        { code: "CALENDAR_EXCEPTION_NOT_FOUND", error: "Calendar exception not found." },
        { status: 404 }
      );
    }

    if (existing.type === CalendarExceptionType.EXAM_PERIOD) {
      const linkedExamCount = await prisma.exam.count({
        where: { examPeriodId: exceptionId, schoolId },
      });
      if (linkedExamCount > 0) {
        return NextResponse.json(
          {
            code: "CALENDAR_EXCEPTION_IN_USE",
            error: "Cannot delete this exam period because it is linked to one or more exams.",
          },
          { status: 409 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.schoolCalendarException.delete({
        where: { id: exceptionId },
      });
      await tx.calendarExceptionAudit.create({
        data: {
          schoolId,
          termId,
          exceptionId,
          actorAuthId,
          operation: "DELETE",
          beforeJson: JSON.stringify(existing),
        },
      });
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[CALENDAR_EXCEPTIONS_DELETE]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}
