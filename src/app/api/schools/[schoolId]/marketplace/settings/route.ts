import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";

const putBodySchema = z.object({
  isEnabled: z.boolean(),
});

async function requireAdminSchoolAccess(schoolId: string) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHORIZED", error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }
  if (!(await assertSchoolAccessForServerUser(user, schoolId))) {
    return NextResponse.json({ code: "FORBIDDEN", error: "Access denied." }, { status: 403 });
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  const { schoolId } = await params;
  if (!schoolId) {
    return NextResponse.json({ code: "SCHOOL_ID_REQUIRED", error: "School ID is required." }, { status: 400 });
  }

  const authError = await requireAdminSchoolAccess(schoolId);
  if (authError) return authError;

  try {
    const row = await prisma.schoolMarketplaceSettings.findUnique({
      where: { schoolId },
      select: { isEnabled: true },
    });
    return NextResponse.json({ isEnabled: row?.isEnabled ?? false }, { status: 200 });
  } catch (err) {
    console.error("[MARKETPLACE_SETTINGS_GET]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  const { schoolId } = await params;
  if (!schoolId) {
    return NextResponse.json({ code: "SCHOOL_ID_REQUIRED", error: "School ID is required." }, { status: 400 });
  }

  const authError = await requireAdminSchoolAccess(schoolId);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.schoolMarketplaceSettings.upsert({
      where: { schoolId },
      create: { schoolId, isEnabled: parsed.data.isEnabled },
      update: { isEnabled: parsed.data.isEnabled },
      select: { isEnabled: true },
    });
    return NextResponse.json({ isEnabled: row.isEnabled }, { status: 200 });
  } catch (err) {
    console.error("[MARKETPLACE_SETTINGS_PUT]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}
