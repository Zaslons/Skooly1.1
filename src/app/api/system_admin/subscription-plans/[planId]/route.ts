import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { z } from 'zod';
import { BillingCycle } from '@prisma/client';

// Zod schema for validating plan update (similar to creation, but all fields optional for PATCH-like behavior with PUT)
const planUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  price: z.number().min(0, "Price must be non-negative").optional(),
  currency: z.string().min(2, "Currency code is required").optional(),
  billingCycle: z.nativeEnum(BillingCycle).optional(),
  features: z.array(z.string()).optional(),
  maxStudents: z.number().int().positive().optional().nullable(),
  maxTeachers: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
});

interface RouteContext {
  params: {
    planId: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const userOrResponse = await requireRole(req, ['system_admin']);
  if (userOrResponse instanceof NextResponse) {
    return userOrResponse;
  }
  const { planId } = params;

  try {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) {
      return NextResponse.json({ message: 'Subscription plan not found' }, { status: 404 });
    }
    return NextResponse.json(plan);
  } catch (error) {
    console.error(`[API GET /system_admin/subscription-plans/${planId}] Error:`, error);
    return NextResponse.json({ message: 'Failed to fetch subscription plan' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const userOrResponse = await requireRole(req, ['system_admin']);
  if (userOrResponse instanceof NextResponse) {
    return userOrResponse;
  }
  const { planId } = params;

  try {
    const jsonData = await req.json();
    const validation = planUpdateSchema.safeParse(jsonData);

    if (!validation.success) {
      return NextResponse.json({ message: "Invalid plan data", errors: validation.error.errors }, { status: 400 });
    }

    // Ensure at least one field is being updated if using partial updates
    if (Object.keys(validation.data).length === 0) {
        return NextResponse.json({ message: "No update data provided" }, { status: 400 });
    }

    const updatedPlan = await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: validation.data,
    });
    return NextResponse.json(updatedPlan);
  } catch (error: any) {
    console.error(`[API PUT /system_admin/subscription-plans/${planId}] Error:`, error);
    if (error.code === 'P2025') { // Record to update not found
        return NextResponse.json({ message: 'Subscription plan not found' }, { status: 404 });
    }
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
        return NextResponse.json({ message: 'A subscription plan with this name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Failed to update subscription plan' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const userOrResponse = await requireRole(req, ['system_admin']);
  if (userOrResponse instanceof NextResponse) {
    return userOrResponse;
  }
  const { planId } = params;

  try {
    // Consider checking if any schools are actively subscribed to this plan before hard deletion
    // For now, direct delete. Could change to soft delete (setting isActive = false).
    // const activeSubscriptions = await prisma.schoolSubscription.count({
    //   where: { planId: planId, status: 'ACTIVE' } // Or TRIALING
    // });
    // if (activeSubscriptions > 0) {
    //   return NextResponse.json({ message: 'Cannot delete plan with active subscriptions. Consider deactivating it instead.' }, { status: 400 });
    // }

    await prisma.subscriptionPlan.delete({
      where: { id: planId },
    });
    return NextResponse.json({ message: 'Subscription plan deleted successfully' }, { status: 200 }); // Or 204 No Content
  } catch (error: any) {
    console.error(`[API DELETE /system_admin/subscription-plans/${planId}] Error:`, error);
    if (error.code === 'P2025') { // Record to delete not found
        return NextResponse.json({ message: 'Subscription plan not found' }, { status: 404 });
    }
     if (error.code === 'P2003') { // Foreign key constraint failed (e.g., school subscriptions depend on this plan)
      return NextResponse.json({ message: 'Cannot delete this plan because it is currently in use by one or more schools. Please deactivate it or reassign schools first.' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Failed to delete subscription plan' }, { status: 500 });
  }
} 