import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  subjectTags: z.array(z.string()).optional(),
  hoursPerWeek: z.number().int().min(1).optional(),
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

  const needs = await prisma.schoolMarketplaceNeed.findMany({
    where: { schoolId },
    include: { _count: { select: { applications: true } } },
    orderBy: { createdAt: "desc" },
  });

  const result = needs.map((n) => ({
    ...n,
    applicantCount: n._count.applications,
    _count: undefined,
  }));

  return NextResponse.json({ needs: result });
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

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });

  const need = await prisma.schoolMarketplaceNeed.create({
    data: {
      schoolId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      subjectTags: parsed.data.subjectTags ?? [],
      hoursPerWeek: parsed.data.hoursPerWeek ?? null,
    },
  });

  return NextResponse.json({ need }, { status: 201 });
}
