import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSchoolAccess, requireRole } from '@/lib/auth'; // Assuming requireSchoolAccess also calls requireAuth
import type { AuthUser } from '@/lib/auth';
import { SubscriptionStatus } from '@prisma/client';

interface RouteContext {
  params: {
    schoolId: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  // First, ensure the user is authenticated and is an admin.
  const adminUserOrResponse = await requireRole(req, ['admin']);
  if (adminUserOrResponse instanceof NextResponse) {
    return adminUserOrResponse;
  }
  const adminUser = adminUserOrResponse as AuthUser;

  // Next, ensure the authenticated admin has access to the requested schoolId.
  const schoolAccessOrResponse = await requireSchoolAccess(req, params.schoolId);
  if (schoolAccessOrResponse instanceof NextResponse) {
    return schoolAccessOrResponse;
  }
  // If requireSchoolAccess was successful, adminUser from requireRole should be the same.
  // We can rely on adminUser.schoolId being validated against params.schoolId by requireSchoolAccess.

  try {
    const currentSubscription = await prisma.schoolSubscription.findFirst({
      where: {
        schoolId: params.schoolId,
        OR: [
          { status: SubscriptionStatus.ACTIVE },
          { status: SubscriptionStatus.TRIALING },
          // Consider if PAST_DUE should also be returned here as "current with issues"
        ],
      },
      include: {
        subscriptionPlan: true, // Include the details of the subscription plan
      },
      orderBy: {
        createdAt: 'desc', // In case there are multiple (shouldn't be for ACTIVE/TRIALING with schema constraint)
      }
    });

    if (!currentSubscription) {
      return NextResponse.json({ message: 'No active or trialing subscription found for this school.' }, { status: 404 });
    }

    return NextResponse.json(currentSubscription);
  } catch (error) {
    console.error(`[API GET /schools/${params.schoolId}/subscriptions/current] Error:`, error);
    return NextResponse.json({ message: 'Failed to fetch current subscription' }, { status: 500 });
  }
} 