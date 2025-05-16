import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { SubscriptionStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  const userOrResponse = await requireRole(req, ['system_admin']);
  if (userOrResponse instanceof NextResponse) {
    return userOrResponse;
  }

  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId');
  const planId = searchParams.get('planId');
  const status = searchParams.get('status') as SubscriptionStatus | null;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const skip = (page - 1) * limit;

  const whereClause: any = {};
  if (schoolId) whereClause.schoolId = schoolId;
  if (planId) whereClause.planId = planId;
  if (status && Object.values(SubscriptionStatus).includes(status)) {
    whereClause.status = status;
  }

  try {
    const schoolSubscriptions = await prisma.schoolSubscription.findMany({
      where: whereClause,
      include: {
        school: {
          select: { id: true, name: true }, // Select only necessary school fields
        },
        subscriptionPlan: {
          select: { id: true, name: true }, // Select only necessary plan fields
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: skip,
      take: limit,
    });

    const totalCount = await prisma.schoolSubscription.count({
        where: whereClause,
    });

    return NextResponse.json({
      data: schoolSubscriptions,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      }
    });
  } catch (error) {
    console.error('[API GET /system_admin/school-subscriptions] Error:', error);
    return NextResponse.json({ message: 'Failed to fetch school subscriptions' }, { status: 500 });
  }
}

// POST method for system admin to manually create/assign a subscription (use with caution)
// This is optional and might not be needed if schools always subscribe themselves.
// export async function POST(req: NextRequest) {
//   const userOrResponse = await requireRole(req, ['system_admin']);
//   if (userOrResponse instanceof NextResponse) {
//     return userOrResponse;
//   }
//   // ... similar logic to the school-facing subscribe route ...
//   // ... but without payment simulation, and ensure schoolId and planId are provided ...
//   // ... careful transaction logic to handle existing subscriptions would still be needed ...
//   return NextResponse.json({ message: 'Manual creation not implemented yet' }, { status: 501 });
// } 