import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";

const applySchema = z.object({
  message: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ needId: string }> }
) {
  const { needId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "teacher") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const teacher = await prisma.teacher.findUnique({
    where: { authId: user.id },
    select: { id: true, marketplaceProfile: { select: { isPublished: true, subjectTags: true } } },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!teacher.marketplaceProfile?.isPublished) {
    return NextResponse.json(
      { error: "You must publish your marketplace profile before applying" },
      { status: 400 }
    );
  }

  const need = await prisma.schoolMarketplaceNeed.findUnique({
    where: { id: needId },
    select: { id: true, isActive: true, subjectTags: true },
  });
  if (!need || !need.isActive) {
    return NextResponse.json({ error: "Position not found or closed" }, { status: 404 });
  }

  const teacherTags = teacher.marketplaceProfile.subjectTags ?? [];
  const needTags = need.subjectTags ?? [];
  if (needTags.length > 0 && !needTags.some((t) => teacherTags.includes(t))) {
    return NextResponse.json(
      { error: "Your subjects don't match this position's requirements" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = applySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  try {
    const application = await prisma.marketplaceApplication.create({
      data: {
        needId,
        teacherId: teacher.id,
        message: parsed.data.message ?? null,
      },
    });
    return NextResponse.json({ application }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "You already applied to this position" }, { status: 409 });
    }
    throw err;
  }
}
