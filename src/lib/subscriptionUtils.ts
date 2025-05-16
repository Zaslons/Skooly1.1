import prisma from './prisma';
import { SchoolSubscription, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

interface ActiveSubscriptionDetails {
  subscription: SchoolSubscription;
  plan: SubscriptionPlan;
}

/**
 * Fetches the current active (or trialing) subscription for a school along with its plan details.
 * An active subscription must have status ACTIVE or TRIALING and the current date must be
 * between its startDate and endDate (if endDate is set).
 * 
 * @param schoolId The ID of the school.
 * @returns The active subscription details, or null if no active subscription is found.
 */
export async function getActiveSchoolSubscription(schoolId: string): Promise<ActiveSubscriptionDetails | null> {
  if (!schoolId) {
    return null;
  }

  const now = new Date();

  try {
    const schoolSubscriptionWithPlan = await prisma.schoolSubscription.findFirst({
      where: {
        schoolId: schoolId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
        currentPeriodStart: {
          lte: now,
        },
        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: now,
            },
          },
        ],
      },
      include: {
        subscriptionPlan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!schoolSubscriptionWithPlan || !schoolSubscriptionWithPlan.subscriptionPlan) {
      return null;
    }

    const { subscriptionPlan, ...subscriptionData } = schoolSubscriptionWithPlan;
    return {
      subscription: subscriptionData as SchoolSubscription,
      plan: subscriptionPlan,
    };
  } catch (error) {
    console.error(`[getActiveSchoolSubscription] Error fetching active subscription for school ${schoolId}:`, error);
    return null; // Return null on error to prevent breaking calling functions
  }
} 