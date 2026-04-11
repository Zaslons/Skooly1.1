import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { AuthUser, requireRole, requireSchoolAccess } from "@/lib/auth";
import {
  assertNoTermOverlap,
  assertStartBeforeEnd,
  assertTermWithinAcademicYear,
  findAcademicYearForSchool,
  TemporalRuleError,
  toDate,
} from "@/lib/domain/temporalRules";

const createTermSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  startDate: z.coerce.date({ message: "Invalid start date" }),
  endDate: z.coerce.date({ message: "Invalid end date" }),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string } }
) {
  const { schoolId, academicYearId } = params;
  if (!schoolId || !academicYearId) {
    return NextResponse.json({ error: "School ID and Academic Year ID are required" }, { status: 400 });
  }

  const userOrResponse = await requireSchoolAccess(request, schoolId);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";

  const parentYear = await findAcademicYearForSchool(academicYearId, schoolId);
  if (!parentYear) {
    return NextResponse.json({ code: "ACADEMIC_YEAR_NOT_FOUND", error: "Academic year not found." }, { status: 404 });
  }

  try {
    const terms = await prisma.term.findMany({
      where: {
        schoolId,
        academicYearId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: [{ startDate: "asc" }],
    });
    return NextResponse.json(terms, { status: 200 });
  } catch (error) {
    console.error("[TERMS_GET]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string } }
) {
  const { schoolId, academicYearId } = params;
  if (!schoolId || !academicYearId) {
    return NextResponse.json({ error: "School ID and Academic Year ID are required" }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;

  const userOrResponse = await requireRole(request, ["admin"]);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const parentYear = await findAcademicYearForSchool(academicYearId, schoolId);
  if (!parentYear) {
    return NextResponse.json({ code: "ACADEMIC_YEAR_NOT_FOUND", error: "Academic year not found." }, { status: 404 });
  }
  if (parentYear.isArchived) {
    return NextResponse.json(
      { code: "ACADEMIC_YEAR_ARCHIVED", error: "Cannot create terms in an archived academic year." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const validated = createTermSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { code: "INVALID_INPUT", error: "Invalid input", fieldErrors: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const startDate = toDate(validated.data.startDate);
    const endDate = toDate(validated.data.endDate);

    assertStartBeforeEnd(startDate, endDate, "term");
    assertTermWithinAcademicYear({
      termStartDate: startDate,
      termEndDate: endDate,
      academicYearStartDate: parentYear.startDate,
      academicYearEndDate: parentYear.endDate,
    });
    await assertNoTermOverlap({ schoolId, academicYearId, startDate, endDate });

    const created = await prisma.$transaction(async (tx) => {
      if (validated.data.isActive) {
        await tx.term.updateMany({
          where: { schoolId, academicYearId },
          data: { isActive: false },
        });
      }
      return tx.term.create({
        data: {
          schoolId,
          academicYearId,
          name: validated.data.name,
          startDate,
          endDate,
          isActive: validated.data.isActive ?? false,
          isArchived: false,
        },
      });
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("[TERMS_POST]", error);
    if (error instanceof TemporalRuleError) {
      return NextResponse.json(
        { code: error.code, error: error.message, fieldErrors: error.fieldErrors },
        { status: 400 }
      );
    }
    if (error.code === "P2002") {
      return NextResponse.json(
        { code: "TERM_NAME_CONFLICT", error: "A term with this name already exists in this academic year." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
