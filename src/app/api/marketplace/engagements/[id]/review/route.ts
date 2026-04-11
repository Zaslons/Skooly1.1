import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
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

  const engagement = await prisma.marketplaceEngagement.findUnique({
    where: { id },
    select: { teacherId: true, status: true },
  });
  if (!engagement || engagement.teacherId !== teacher.id) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }
  if (engagement.status === "ACTIVE") {
    return NextResponse.json({ error: "Engagement must end before reviewing" }, { status: 400 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid review data" }, { status: 400 });

  try {
    const review = await prisma.marketplaceReview.create({
      data: {
        engagementId: id,
        reviewerRole: "TEACHER",
        reviewerAuthId: user.id,
        rating: parsed.data.rating,
        comment: parsed.data.comment ?? null,
      },
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
    }
    throw err;
  }
}
