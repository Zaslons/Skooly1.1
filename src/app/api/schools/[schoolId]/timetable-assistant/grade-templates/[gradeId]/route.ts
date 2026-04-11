import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { timetableAssistantSchoolTemplateRowsSchema } from "@/lib/formValidationSchemas";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";

const paramsSchema = z.object({
  schoolId: z.string().min(1),
  gradeId: z.coerce.number().int().positive(),
});

const putBodySchema = z.object({
  rowsJson: timetableAssistantSchoolTemplateRowsSchema,
});

async function assertGradeInSchool(schoolId: string, gradeId: number) {
  const grade = await prisma.grade.findFirst({
    where: { id: gradeId, schoolId },
    select: { id: true },
  });
  return grade;
}

export async function GET(request: NextRequest, { params }: { params: { schoolId: string; gradeId: string } }) {
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "Invalid parameters." }, { status: 400 });
  }
  const { schoolId, gradeId } = parsedParams.data;

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }

  const grade = await assertGradeInSchool(schoolId, gradeId);
  if (!grade) {
    return NextResponse.json({ code: "NOT_FOUND", error: "Grade not found for this school." }, { status: 404 });
  }

  const row = await prisma.timetableGradeTemplate.findUnique({
    where: { schoolId_gradeId: { schoolId, gradeId } },
    select: { gradeId: true, rowsJson: true, updatedAt: true },
  });

  if (!row) {
    return NextResponse.json({ gradeId, rowsJson: [], updatedAt: null }, { status: 200 });
  }

  return NextResponse.json(
    {
      gradeId: row.gradeId,
      rowsJson: row.rowsJson,
      updatedAt: row.updatedAt.toISOString(),
    },
    { status: 200 }
  );
}

export async function PUT(request: NextRequest, { params }: { params: { schoolId: string; gradeId: string } }) {
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "Invalid parameters." }, { status: 400 });
  }
  const { schoolId, gradeId } = parsedParams.data;

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }

  const grade = await assertGradeInSchool(schoolId, gradeId);
  if (!grade) {
    return NextResponse.json({ code: "NOT_FOUND", error: "Grade not found for this school." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const saved = await prisma.timetableGradeTemplate.upsert({
    where: { schoolId_gradeId: { schoolId, gradeId } },
    create: {
      schoolId,
      gradeId,
      rowsJson: parsed.data.rowsJson,
    },
    update: {
      rowsJson: parsed.data.rowsJson,
    },
    select: { gradeId: true, rowsJson: true, updatedAt: true },
  });

  return NextResponse.json(
    {
      gradeId: saved.gradeId,
      rowsJson: saved.rowsJson,
      updatedAt: saved.updatedAt.toISOString(),
    },
    { status: 200 }
  );
}
