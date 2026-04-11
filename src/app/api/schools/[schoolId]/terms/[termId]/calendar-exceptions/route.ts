import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CalendarExceptionType } from "@prisma/client";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import {
  assertCalendarExceptionWithinTerm,
  TemporalRuleError,
} from "@/lib/domain/temporalRules";
import { schoolCalendarExceptionCreateSchema } from "@/lib/formValidationSchemas";

/**
 * E0: term-scoped school calendar exceptions (holidays, breaks, exam periods).
 * Creating a row requires an existing term — enforced by URL + DB FK.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string; termId: string } }
) {
  const { schoolId, termId } = params;
  if (!schoolId || !termId) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "schoolId and termId are required." }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;

  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId },
    select: { id: true },
  });
  if (!term) {
    return NextResponse.json({ code: "TERM_NOT_FOUND", error: "Term not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const typeRaw = searchParams.get("type");
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");

  let typeFilter: CalendarExceptionType | undefined;
  if (typeRaw) {
    if (!Object.values(CalendarExceptionType).includes(typeRaw as CalendarExceptionType)) {
      return NextResponse.json({ code: "INVALID_INPUT", error: "Invalid exception type filter." }, { status: 400 });
    }
    typeFilter = typeRaw as CalendarExceptionType;
  }

  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;
  if ((fromRaw && Number.isNaN(from?.getTime())) || (toRaw && Number.isNaN(to?.getTime()))) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "Invalid from/to date filter." }, { status: 400 });
  }
  if (from && to && from > to) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "`from` must be before or equal to `to`." }, { status: 400 });
  }

  const rows = await prisma.schoolCalendarException.findMany({
    where: {
      schoolId,
      termId,
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(from || to
        ? {
            startDate: { lte: to ?? undefined },
            endDate: { gte: from ?? undefined },
          }
        : {}),
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });

  return NextResponse.json({ exceptions: rows }, { status: 200 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { schoolId: string; termId: string } }
) {
  const { schoolId, termId } = params;
  if (!schoolId || !termId) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "schoolId and termId are required." }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = schoolCalendarExceptionCreateSchema.safeParse(body);
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

    const term = await prisma.term.findFirst({
      where: { id: termId, schoolId },
      select: { id: true, startDate: true, endDate: true, isArchived: true },
    });
    if (!term) {
      return NextResponse.json({ code: "TERM_NOT_FOUND", error: "Term not found." }, { status: 404 });
    }
    if (term.isArchived) {
      return NextResponse.json(
        { code: "TERM_ARCHIVED", error: "Cannot add calendar exceptions to an archived term." },
        { status: 400 }
      );
    }

    assertCalendarExceptionWithinTerm({
      termStartDate: term.startDate,
      termEndDate: term.endDate,
      exceptionStart: validated.data.startDate,
      exceptionEnd: validated.data.endDate,
    });

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.schoolCalendarException.create({
        data: {
          schoolId,
          termId,
          title: validated.data.title,
          type: validated.data.type,
          startDate: validated.data.startDate,
          endDate: validated.data.endDate,
          notes: validated.data.notes ?? null,
        },
      });
      await tx.calendarExceptionAudit.create({
        data: {
          schoolId,
          termId,
          exceptionId: row.id,
          actorAuthId: user.id ?? null,
          operation: "CREATE",
          afterJson: JSON.stringify(row),
        },
      });
      return row;
    });

    return NextResponse.json({ exception: created }, { status: 201 });
  } catch (err) {
    if (err instanceof TemporalRuleError) {
      return NextResponse.json(
        { code: err.code, error: err.message, fieldErrors: err.fieldErrors },
        { status: 400 }
      );
    }
    console.error("[CALENDAR_EXCEPTIONS_POST]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}
