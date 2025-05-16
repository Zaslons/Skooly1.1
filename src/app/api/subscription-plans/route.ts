import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth'; // Assuming requireAuth verifies token and returns user or NextResponse
import type { AuthUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const userOrResponse = await requireAuth(req);
  if (userOrResponse instanceof NextResponse) {
    return userOrResponse; // Unauthorized or invalid token
  }
  const authUser = userOrResponse as AuthUser;

  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: {
        // If the user is not a system_admin, only show active plans
        ...(authUser.role !== 'system_admin' && { isActive: true }),
      },
      orderBy: {
        price: 'asc', // Optional: order by price or name
      },
    });
    return NextResponse.json(plans);
  } catch (error) {
    console.error('[API /subscription-plans] Error fetching plans:', error);
    return NextResponse.json({ message: 'Failed to fetch subscription plans' }, { status: 500 });
  }
} 