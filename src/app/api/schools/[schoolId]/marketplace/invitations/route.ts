import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";

const createSchema = z.object({
  teacherId: z.string().min(1),
  message: z.string().optional(),
  proposedHoursPerWeek: z.number().int().min(1).optional(),
  proposedHourlyRate: z.number().nonnegative().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  const { schoolId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await assertSchoolAccessForServerUser(user, schoolId)))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const invitations = await prisma.marketplaceInvitation.findMany({
    where: { schoolId },
    include: {
      teacher: { select: { id: true, name: true, surname: true, img: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invitations });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  const { schoolId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await assertSchoolAccessForServerUser(user, schoolId)))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const settings = await prisma.schoolMarketplaceSettings.findUnique({ where: { schoolId } });
  if (!settings?.isEnabled) {
    return NextResponse.json({ error: "Marketplace not enabled" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { teacherId, message, proposedHoursPerWeek, proposedHourlyRate } = parsed.data;

  const profile = await prisma.teacherMarketplaceProfile.findUnique({
    where: { teacherId },
    select: { isPublished: true },
  });
  if (!profile?.isPublished) {
    return NextResponse.json({ error: "Teacher profile not found or not published" }, { status: 404 });
  }

  const existing = await prisma.marketplaceInvitation.findFirst({
    where: { schoolId, teacherId, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json({ error: "A pending invitation already exists for this teacher" }, { status: 409 });
  }

  const invitation = await prisma.marketplaceInvitation.create({
    data: {
      schoolId,
      teacherId,
      message: message ?? null,
      proposedHoursPerWeek: proposedHoursPerWeek ?? null,
      proposedHourlyRate: proposedHourlyRate ?? null,
    },
    include: {
      teacher: { select: { id: true, name: true, surname: true } },
    },
  });

  return NextResponse.json({ invitation }, { status: 201 });
}
