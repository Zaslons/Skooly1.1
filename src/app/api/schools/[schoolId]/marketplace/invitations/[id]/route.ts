import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ schoolId: string; id: string }> }
) {
  const { schoolId, id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await assertSchoolAccessForServerUser(user, schoolId)))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const invitation = await prisma.marketplaceInvitation.findUnique({
    where: { id },
    select: { schoolId: true, status: true },
  });
  if (!invitation || invitation.schoolId !== schoolId) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: "Can only withdraw pending invitations" }, { status: 400 });
  }

  const updated = await prisma.marketplaceInvitation.update({
    where: { id },
    data: { status: "WITHDRAWN" },
  });

  return NextResponse.json({ invitation: updated });
}
