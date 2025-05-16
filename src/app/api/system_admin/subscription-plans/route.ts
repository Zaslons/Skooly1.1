import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import { z } from 'zod';
import { BillingCycle } from '@prisma/client'; // Import enum

// Zod schema for validating plan creation/update
const planSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.number().min(0, "Price must be non-negative"), // Prisma Decimal maps to number in JS
  currency: z.string().min(2, "Currency code is required"),
  billingCycle: z.nativeEnum(BillingCycle),
  features: z.array(z.string()).optional().default([]),
  maxStudents: z.number().int().positive().optional().nullable(),
  maxTeachers: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const userOrResponse = await requireRole(req, ['system_admin']);
  if (userOrResponse instanceof NextResponse) {
    return userOrResponse;
  }
  // const authUser = userOrResponse as AuthUser;

  try {
    const jsonData = await req.json();
    const validation = planSchema.safeParse(jsonData);

    if (!validation.success) {
      return NextResponse.json({ message: "Invalid plan data", errors: validation.error.errors }, { status: 400 });
    }

    const newPlan = await prisma.subscriptionPlan.create({
      data: validation.data,
    });
    return NextResponse.json(newPlan, { status: 201 });
  } catch (error: any) {
    console.error('[API POST /system_admin/subscription-plans] Error creating plan:', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
        return NextResponse.json({ message: 'A subscription plan with this name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Failed to create subscription plan' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
    const userOrResponse = await requireRole(req, ['system_admin']);
    if (userOrResponse instanceof NextResponse) {
      return userOrResponse;
    }
    // const authUser = userOrResponse as AuthUser;
  
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        orderBy: {
          createdAt: 'desc', // Show newest first for admin view
        },
      });
      return NextResponse.json(plans);
    } catch (error) {
      console.error('[API GET /system_admin/subscription-plans] Error fetching plans:', error);
      return NextResponse.json({ message: 'Failed to fetch subscription plans for admin' }, { status: 500 });
    }
  } 