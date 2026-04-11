import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";

const patchSchema = z.object({
  status: z.enum(["COMPLETED", "TERMINATED"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ schoolId: string; id: string }> }
) {
  const { schoolId, id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await assertSchoolAccessForServerUser(user, schoolId)))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const engagement = await prisma.marketplaceEngagement.findUnique({
    where: { id },
    select: { schoolId: true, status: true, membershipId: true, teacherId: true },
  });
  if (!engagement || engagement.schoolId !== schoolId) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }
  if (engagement.status !== "ACTIVE") {
    return NextResponse.json({ error: "Engagement is not active" }, { status: 400 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const updated = await prisma.$transaction(async (tx) => {
    const eng = await tx.marketplaceEngagement.update({
      where: { id },
      data: { status: parsed.data.status, endDate: new Date() },
    });

    if (engagement.membershipId) {
      const otherActive = await tx.marketplaceEngagement.count({
        where: {
          teacherId: engagement.teacherId,
          schoolId,
          status: "ACTIVE",
          id: { not: id },
        },
      });
      if (otherActive === 0) {
        await tx.schoolMembership.updateMany({
          where: { id: engagement.membershipId },
          data: { isActive: false },
        });
      }
    }

    return eng;
  });

  return NextResponse.json({ engagement: updated });
}
