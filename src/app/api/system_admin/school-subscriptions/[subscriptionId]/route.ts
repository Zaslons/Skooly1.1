import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { SubscriptionStatus } from '@prisma/client';
import { z } from 'zod';

interface RouteContext {
  params: {
    subscriptionId: string;
  };
}

// Zod schema for updating a school subscription (system admin only)
const schoolSubscriptionUpdateSchema = z.object({
  planId: z.string().cuid("Invalid Plan ID format").optional(),
  currentPeriodStart: z.coerce.date().optional(), // coerce to try and parse date string
  endDate: z.coerce.date().optional().nullable(),
  nextBillingDate: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(SubscriptionStatus).optional(),
  stripeSubscriptionId: z.string().optional(), // Cannot be null if present, as Prisma field is not nullable.
});

export async function GET(req: NextRequest, { params }: RouteContext) {
  const userOrResponse = await requireRole(req, ['system_admin']);
  if (userOrResponse instanceof NextResponse) {
    return userOrResponse;
  }
  const { subscriptionId } = params;

  try {
    const subscription = await prisma.schoolSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        school: { select: { id: true, name: true } },
        subscriptionPlan: true, // Get full plan details
      },
    });

    if (!subscription) {
      return NextResponse.json({ message: 'School subscription not found' }, { status: 404 });
    }
    return NextResponse.json(subscription);
  } catch (error) {
    console.error(`[API GET /system_admin/school-subscriptions/${subscriptionId}] Error:`, error);
    return NextResponse.json({ message: 'Failed to fetch school subscription' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const userOrResponse = await requireRole(req, ['system_admin']);
  if (userOrResponse instanceof NextResponse) {
    return userOrResponse;
  }
  const { subscriptionId } = params;

  try {
    const jsonData = await req.json();
    const validation = schoolSubscriptionUpdateSchema.safeParse(jsonData);

    if (!validation.success) {
      return NextResponse.json({ message: "Invalid subscription data", errors: validation.error.errors }, { status: 400 });
    }
    
    const updateData = { ...validation.data }; // clone to modify

    // If stripeSubscriptionId is an empty string, treat it as undefined for Prisma update
    // to avoid trying to set a non-nullable unique field to empty.
    if (updateData.stripeSubscriptionId === '') {
      updateData.stripeSubscriptionId = undefined;
    }

    if (Object.keys(updateData).filter(k => updateData[k as keyof typeof updateData] !== undefined).length === 0) {
      return NextResponse.json({ message: "No update data provided" }, { status: 400 });
    }

    // If status is part of the update, and it's moving to ACTIVE/TRIALING,
    // ensure no other subscription for the same school has this status (if that's your rule).
    // The `subscribe` endpoint already handles deactivating old ones. This manual PUT is more direct.
    // This might require a transaction if changing status to ACTIVE/TRIALING to first deactivate others.
    // For simplicity here, we assume this direct update won't cause unique constraint violations if the admin is careful,
    // or that the `@@unique([schoolId, status])` allows for multiple INACTIVE/CANCELED etc.

    const updatedSubscription = await prisma.schoolSubscription.update({
      where: { id: subscriptionId },
      data: updateData,
      include: {
        school: { select: { id: true, name: true } },
        subscriptionPlan: true,
      },
    });
    return NextResponse.json(updatedSubscription);
  } catch (error: any) {
    console.error(`[API PUT /system_admin/school-subscriptions/${subscriptionId}] Error:`, error);
    if (error.code === 'P2025') { // Record to update not found
      return NextResponse.json({ message: 'School subscription not found' }, { status: 404 });
    }
    // Potentially handle P2002 if planId is changed to one that causes conflict, though less likely here.
    return NextResponse.json({ message: 'Failed to update school subscription' }, { status: 500 });
  }
}

// DELETE is generally not recommended for historical subscription records.
// Changing status to CANCELED or INACTIVE is often preferred.
// export async function DELETE(req: NextRequest, { params }: RouteContext) { ... } 