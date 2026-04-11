import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { AuthUser, requireRole, requireSchoolAccess } from "@/lib/auth";
import {
  assertNoTermOverlap,
  assertStartBeforeEnd,
  assertTermWithinAcademicYear,
  findAcademicYearForSchool,
  findTermForSchool,
  setSingleActiveTerm,
  TemporalRuleError,
  toDate,
} from "@/lib/domain/temporalRules";

const updateTermSchema = z.object({
  name: z.string().min(1, { message: "Name cannot be empty." }).optional(),
  startDate: z.coerce.date({ message: "Invalid start date" }).optional(),
  endDate: z.coerce.date({ message: "Invalid end date" }).optional(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string; termId: string } }
) {
  const { schoolId, academicYearId, termId } = params;
  if (!schoolId || !academicYearId || !termId) {
    return NextResponse.json({ error: "School ID, Academic Year ID, and Term ID are required." }, { status: 400 });
  }

  const userOrResponse = await requireSchoolAccess(request, schoolId);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId, academicYearId },
  });
  if (!term) {
    return NextResponse.json({ code: "TERM_NOT_FOUND", error: "Term not found." }, { status: 404 });
  }
  return NextResponse.json(term, { status: 200 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string; termId: string } }
) {
  const { schoolId, academicYearId, termId } = params;
  if (!schoolId || !academicYearId || !termId) {
    return NextResponse.json({ error: "School ID, Academic Year ID, and Term ID are required." }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;

  const userOrResponse = await requireRole(request, ["admin"]);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const parentYear = await findAcademicYearForSchool(academicYearId, schoolId);
  if (!parentYear) {
    return NextResponse.json({ code: "ACADEMIC_YEAR_NOT_FOUND", error: "Academic year not found." }, { status: 404 });
  }

  const existingTerm = await findTermForSchool(termId, schoolId);
  if (!existingTerm || existingTerm.academicYearId !== academicYearId) {
    return NextResponse.json({ code: "TERM_NOT_FOUND", error: "Term not found for this academic year." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const validated = updateTermSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { code: "INVALID_INPUT", error: "Invalid input", fieldErrors: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const startDate = validated.data.startDate ? toDate(validated.data.startDate) : existingTerm.startDate;
    const endDate = validated.data.endDate ? toDate(validated.data.endDate) : existingTerm.endDate;

    assertStartBeforeEnd(startDate, endDate, "term");
    assertTermWithinAcademicYear({
      termStartDate: startDate,
      termEndDate: endDate,
      academicYearStartDate: parentYear.startDate,
      academicYearEndDate: parentYear.endDate,
    });

    await assertNoTermOverlap({
      schoolId,
      academicYearId,
      startDate,
      endDate,
      excludeId: termId,
    });

    if (parentYear.isArchived && (validated.data.isActive || validated.data.isArchived === false)) {
      return NextResponse.json(
        { code: "ACADEMIC_YEAR_ARCHIVED", error: "Cannot activate or unarchive term under archived academic year." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (validated.data.isActive === true) {
        await setSingleActiveTerm({ tx, schoolId, academicYearId, termId });
      } else if (validated.data.isActive === false) {
        await tx.term.update({
          where: { id: termId },
          data: { isActive: false },
        });
      }

      return tx.term.update({
        where: { id: termId },
        data: {
          name: validated.data.name,
          startDate: validated.data.startDate ? startDate : undefined,
          endDate: validated.data.endDate ? endDate : undefined,
          isActive: validated.data.isActive,
          isArchived: validated.data.isArchived,
        },
      });
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("[TERM_PATCH]", error);
    if (error instanceof TemporalRuleError) {
      return NextResponse.json(
        { code: error.code, error: error.message, fieldErrors: error.fieldErrors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { schoolId: string; academicYearId: string; termId: string } }
) {
  const { schoolId, academicYearId, termId } = params;
  if (!schoolId || !academicYearId || !termId) {
    return NextResponse.json({ error: "School ID, Academic Year ID, and Term ID are required." }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;

  const userOrResponse = await requireRole(request, ["admin"]);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const existingTerm = await prisma.term.findFirst({
    where: { id: termId, schoolId, academicYearId },
    select: { id: true, isArchived: true, isActive: true },
  });

  if (!existingTerm) {
    return NextResponse.json({ code: "TERM_NOT_FOUND", error: "Term not found." }, { status: 404 });
  }

  if (existingTerm.isArchived) {
    return NextResponse.json({ code: "TERM_ALREADY_ARCHIVED", error: "Term is already archived." }, { status: 400 });
  }

  const archived = await prisma.term.update({
    where: { id: termId },
    data: { isArchived: true, isActive: false },
  });

  return NextResponse.json(archived, { status: 200 });
}
