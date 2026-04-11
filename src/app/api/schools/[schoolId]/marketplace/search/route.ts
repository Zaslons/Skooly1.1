import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";

export async function GET(
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
    return NextResponse.json({ error: "Marketplace not enabled for this school" }, { status: 403 });
  }

  const url = new URL(request.url);
  const subjects = url.searchParams.get("subjects")?.split(",").filter(Boolean) ?? [];
  const city = url.searchParams.get("city") ?? null;
  const offersOnline = url.searchParams.get("offersOnline") === "true" ? true : null;
  const maxRate = url.searchParams.get("maxHourlyRate") ? Number(url.searchParams.get("maxHourlyRate")) : null;
  const days = url.searchParams.get("availableDays")?.split(",").filter(Boolean) ?? [];
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  const existingTeacherIds = await prisma.schoolMembership.findMany({
    where: { schoolId, role: "teacher", isActive: true },
    select: { teacherId: true },
  });
  const excludeIds = existingTeacherIds
    .map((m) => m.teacherId)
    .filter((id): id is string => id != null);

  const where: any = {
    isPublished: true,
    ...(excludeIds.length > 0 && { teacherId: { notIn: excludeIds } }),
  };

  if (subjects.length > 0) {
    where.subjectTags = { hasSome: subjects };
  }
  if (city) {
    where.city = { contains: city, mode: "insensitive" };
  }
  if (offersOnline) {
    where.offersOnline = true;
  }
  if (maxRate != null && !isNaN(maxRate)) {
    where.hourlyRate = { lte: maxRate };
  }
  if (days.length > 0) {
    where.availableDays = { hasSome: days };
  }

  try {
    const [profiles, total] = await Promise.all([
      prisma.teacherMarketplaceProfile.findMany({
        where,
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              surname: true,
              img: true,
              email: true,
              marketplaceEngagements: {
                where: { status: "COMPLETED" },
                select: {
                  reviews: {
                    where: { reviewerRole: "SCHOOL" },
                    select: { rating: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.teacherMarketplaceProfile.count({ where }),
    ]);

    const results = profiles.map((p) => {
      const allRatings = p.teacher.marketplaceEngagements.flatMap((e) =>
        e.reviews.map((r) => r.rating)
      );
      const avgRating = allRatings.length > 0
        ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length
        : null;

      return {
        profileId: p.id,
        teacherId: p.teacherId,
        name: `${p.teacher.name} ${p.teacher.surname}`,
        img: p.teacher.img,
        headline: p.headline,
        subjectTags: p.subjectTags,
        availableDays: p.availableDays,
        maxHoursPerWeek: p.maxHoursPerWeek,
        hourlyRate: p.hourlyRate,
        currency: p.currency,
        city: p.city,
        country: p.country,
        offersOnline: p.offersOnline,
        willingToRelocate: p.willingToRelocate,
        yearsOfExp: p.yearsOfExp,
        avgRating,
        reviewCount: allRatings.length,
      };
    });

    return NextResponse.json({ results, total, page, limit });
  } catch (err) {
    console.error("[MARKETPLACE_SEARCH]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
