import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

const defaultProfileShape = {
  id: null as string | null,
  headline: null as string | null,
  bio: null as string | null,
  yearsOfExp: null as number | null,
  hourlyRate: null as number | null,
  currency: "MAD",
  isPublished: false,
  subjectTags: [] as string[],
  availableDays: [] as string[],
  maxHoursPerWeek: null as number | null,
  city: null as string | null,
  country: "Morocco",
  willingToRelocate: false,
  offersOnline: false,
};

function toResponseProfile(
  teacherId: string,
  row: {
    id: string;
    headline: string | null;
    bio: string | null;
    yearsOfExp: number | null;
    hourlyRate: number | null;
    currency: string;
    isPublished: boolean;
    subjectTags: string[];
    availableDays: string[];
    maxHoursPerWeek: number | null;
    city: string | null;
    country: string | null;
    willingToRelocate: boolean;
    offersOnline: boolean;
  } | null
) {
  if (!row) {
    return { teacherId, ...defaultProfileShape };
  }
  return {
    teacherId,
    id: row.id,
    headline: row.headline,
    bio: row.bio,
    yearsOfExp: row.yearsOfExp,
    hourlyRate: row.hourlyRate,
    currency: row.currency,
    isPublished: row.isPublished,
    subjectTags: row.subjectTags,
    availableDays: row.availableDays,
    maxHoursPerWeek: row.maxHoursPerWeek,
    city: row.city,
    country: row.country ?? "Morocco",
    willingToRelocate: row.willingToRelocate,
    offersOnline: row.offersOnline,
  };
}

const putBodySchema = z.object({
  headline: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  yearsOfExp: z.number().int().min(0).nullable().optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
  currency: z.string().min(1).optional(),
  isPublished: z.boolean().optional(),
  subjectTags: z.array(z.string()).optional(),
  availableDays: z.array(z.string()).optional(),
  maxHoursPerWeek: z.number().int().min(0).nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  willingToRelocate: z.boolean().optional(),
  offersOnline: z.boolean().optional(),
});

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teacher = await prisma.teacher.findUnique({
    where: { authId: user.id },
    include: { marketplaceProfile: true },
  });

  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  return NextResponse.json(toResponseProfile(teacher.id, teacher.marketplaceProfile));
}

export async function PUT(request: Request) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teacher = await prisma.teacher.findUnique({
    where: { authId: user.id },
    select: { id: true },
  });

  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const defined = <K extends keyof typeof d>(key: K) => d[key] !== undefined;

  const createPayload = {
    teacherId: teacher.id,
    headline: defined("headline") ? d.headline ?? null : null,
    bio: defined("bio") ? d.bio ?? null : null,
    yearsOfExp: defined("yearsOfExp") ? d.yearsOfExp ?? null : null,
    hourlyRate: defined("hourlyRate") ? d.hourlyRate ?? null : null,
    currency: defined("currency") ? d.currency! : "MAD",
    isPublished: defined("isPublished") ? d.isPublished! : false,
    subjectTags: defined("subjectTags") ? d.subjectTags! : [],
    availableDays: defined("availableDays") ? d.availableDays! : [],
    maxHoursPerWeek: defined("maxHoursPerWeek") ? d.maxHoursPerWeek ?? null : null,
    city: defined("city") ? d.city ?? null : null,
    country: defined("country") ? d.country ?? null : "Morocco",
    willingToRelocate: defined("willingToRelocate") ? d.willingToRelocate! : false,
    offersOnline: defined("offersOnline") ? d.offersOnline! : false,
  };

  const updatePayload: Record<string, unknown> = {};
  if (defined("headline")) updatePayload.headline = d.headline ?? null;
  if (defined("bio")) updatePayload.bio = d.bio ?? null;
  if (defined("yearsOfExp")) updatePayload.yearsOfExp = d.yearsOfExp ?? null;
  if (defined("hourlyRate")) updatePayload.hourlyRate = d.hourlyRate ?? null;
  if (defined("currency")) updatePayload.currency = d.currency;
  if (defined("isPublished")) updatePayload.isPublished = d.isPublished;
  if (defined("subjectTags")) updatePayload.subjectTags = d.subjectTags;
  if (defined("availableDays")) updatePayload.availableDays = d.availableDays;
  if (defined("maxHoursPerWeek")) updatePayload.maxHoursPerWeek = d.maxHoursPerWeek ?? null;
  if (defined("city")) updatePayload.city = d.city ?? null;
  if (defined("country")) updatePayload.country = d.country ?? null;
  if (defined("willingToRelocate")) updatePayload.willingToRelocate = d.willingToRelocate;
  if (defined("offersOnline")) updatePayload.offersOnline = d.offersOnline;

  const existing = await prisma.teacherMarketplaceProfile.findUnique({
    where: { teacherId: teacher.id },
  });
  if (existing && Object.keys(updatePayload).length === 0) {
    return NextResponse.json(toResponseProfile(teacher.id, existing));
  }

  const row = await prisma.teacherMarketplaceProfile.upsert({
    where: { teacherId: teacher.id },
    create: createPayload,
    update:
      Object.keys(updatePayload).length > 0
        ? updatePayload
        : { updatedAt: new Date() },
  });

  return NextResponse.json(toResponseProfile(teacher.id, row));
}
