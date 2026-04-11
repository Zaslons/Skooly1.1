import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import { periodUpdateSchema } from "@/lib/formValidationSchemas";
import {
  assertPeriodDoesNotOverlapOthers,
  assertPeriodWithinDefaultSchoolHours,
  BellPeriodError,
} from "@/lib/domain/bellPeriodRules";

/**
 * Bell schedule: update / soft-archive a single `Period`.
 * @see docs/scheduling/BELL_SCHEDULE_IMPLEMENTATION.md Phase 1
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { schoolId: string; periodId: string } }
) {
  const { schoolId, periodId } = params;
  if (!schoolId || !periodId) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "schoolId and periodId are required." }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }

  try {
    const existing = await prisma.period.findFirst({
      where: { id: periodId, schoolId },
    });
    if (!existing) {
      return NextResponse.json({ code: "PERIOD_NOT_FOUND", error: "Period not found." }, { status: 404 });
    }

    const body = await request.json();
    const validated = periodUpdateSchema.safeParse(body);
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

    const d = validated.data;
    const nextName = d.name !== undefined ? d.name.trim() : existing.name;
    const nextStart = d.startTime ?? existing.startTime;
    const nextEnd = d.endTime ?? existing.endTime;
    const nextOrder = d.order !== undefined ? d.order : existing.order;
    const nextArchived = d.isArchived !== undefined ? d.isArchived : existing.isArchived;

    if (!nextArchived) {
      assertPeriodWithinDefaultSchoolHours(nextStart, nextEnd);
      const others = await prisma.period.findMany({
        where: {
          schoolId,
          isArchived: false,
          id: { not: periodId },
        },
        select: { id: true, name: true, startTime: true, endTime: true },
      });
      assertPeriodDoesNotOverlapOthers({ startTime: nextStart, endTime: nextEnd }, others);
    }

    try {
      const updated = await prisma.period.update({
        where: { id: periodId },
        data: {
          name: nextName,
          startTime: nextStart,
          endTime: nextEnd,
          order: nextOrder,
          isArchived: nextArchived,
        },
      });
      return NextResponse.json({ period: updated }, { status: 200 });
    } catch (err) {
      if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
        return NextResponse.json(
          { code: "PERIOD_NAME_CONFLICT", error: "A period with this name already exists for this school." },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof BellPeriodError) {
      return NextResponse.json({ code: err.code, error: err.message }, { status: 400 });
    }
    console.error("[PERIODS_PATCH]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}
