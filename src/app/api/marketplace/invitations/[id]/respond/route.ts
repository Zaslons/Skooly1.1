import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";

const respondSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "teacher") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const teacher = await prisma.teacher.findUnique({
    where: { authId: user.id },
    select: { id: true },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

  const invitation = await prisma.marketplaceInvitation.findUnique({
    where: { id },
    select: { id: true, teacherId: true, schoolId: true, status: true, proposedHoursPerWeek: true, proposedHourlyRate: true },
  });
  if (!invitation || invitation.teacherId !== teacher.id) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: "Invitation is no longer pending" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (parsed.data.action === "decline") {
    await prisma.marketplaceInvitation.update({
      where: { id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    return NextResponse.json({ status: "declined" });
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.marketplaceInvitation.update({
      where: { id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });

    let membership = await tx.schoolMembership.findFirst({
      where: { authId: user.id, schoolId: invitation.schoolId, role: "teacher" },
    });
    if (!membership) {
      membership = await tx.schoolMembership.create({
        data: {
          authId: user.id,
          schoolId: invitation.schoolId,
          role: "teacher",
          teacherId: teacher.id,
        },
      });
    } else if (!membership.isActive) {
      membership = await tx.schoolMembership.update({
        where: { id: membership.id },
        data: { isActive: true },
      });
    }

    const engagement = await tx.marketplaceEngagement.create({
      data: {
        invitationId: invitation.id,
        schoolId: invitation.schoolId,
        teacherId: teacher.id,
        membershipId: membership.id,
        agreedHoursPerWeek: invitation.proposedHoursPerWeek,
        agreedHourlyRate: invitation.proposedHourlyRate,
      },
    });

    return { engagement, membershipId: membership.id };
  });

  return NextResponse.json({ status: "accepted", engagement: result.engagement });
}
