import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import { periodCreateSchema } from "@/lib/formValidationSchemas";
import {
  assertPeriodDoesNotOverlapOthers,
  assertPeriodWithinDefaultSchoolHours,
  BellPeriodError,
} from "@/lib/domain/bellPeriodRules";

/**
 * Bell schedule: list and create `Period` rows for a school (admin).
 * @see docs/scheduling/BELL_SCHEDULE_IMPLEMENTATION.md Phase 1
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

  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";

  try {
    const periods = await prisma.period.findMany({
      where: {
        schoolId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ periods }, { status: 200 });
  } catch (err) {
    console.error("[PERIODS_GET]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
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
    const body = await request.json();
    const validated = periodCreateSchema.safeParse(body);
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

    const { name, startTime, endTime, isArchived } = validated.data;
    const archived = isArchived ?? false;

    if (!archived) {
      assertPeriodWithinDefaultSchoolHours(startTime, endTime);
      const existing = await prisma.period.findMany({
        where: { schoolId, isArchived: false },
        select: { id: true, name: true, startTime: true, endTime: true },
      });
      assertPeriodDoesNotOverlapOthers({ startTime, endTime }, existing);
    }

    let order = validated.data.order;
    if (order === undefined) {
      const agg = await prisma.period.aggregate({
        where: { schoolId },
        _max: { order: true },
      });
      order = (agg._max.order ?? -1) + 1;
    }

    const created = await prisma.period.create({
      data: {
        schoolId,
        name: name.trim(),
        startTime,
        endTime,
        order,
        isArchived: archived,
      },
    });

    return NextResponse.json({ period: created }, { status: 201 });
  } catch (err) {
    if (err instanceof BellPeriodError) {
      return NextResponse.json({ code: err.code, error: err.message }, { status: 400 });
    }
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { code: "PERIOD_NAME_CONFLICT", error: "A period with this name already exists for this school." },
        { status: 409 }
      );
    }
    console.error("[PERIODS_POST]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}
