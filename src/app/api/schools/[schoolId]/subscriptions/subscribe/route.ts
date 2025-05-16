import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSchoolAccess, requireRole } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { BillingCycle } from '@prisma/client';

interface RouteContext {
  params: {
    schoolId: string;
  };
}

const subscribeSchema = z.object({
  planId: z.string().cuid("Invalid Plan ID format"),
  // paymentMethodId: z.string().optional(), // Example: if you were to pass a payment method ID from client
});

export async function POST(req: NextRequest, { params }: RouteContext) {
  const adminUserOrResponse = await requireRole(req, ['admin']);
  if (adminUserOrResponse instanceof NextResponse) {
    return adminUserOrResponse;
  }

  const schoolAccessOrResponse = await requireSchoolAccess(req, params.schoolId);
  if (schoolAccessOrResponse instanceof NextResponse) {
    return schoolAccessOrResponse;
  }
  const schoolId = params.schoolId;

  try {
    const jsonData = await req.json();
    const validation = subscribeSchema.safeParse(jsonData);
    if (!validation.success) {
      return NextResponse.json({ message: "Invalid subscription data", errors: validation.error.errors }, { status: 400 });
    }
    const { planId } = validation.data;

    // 1. Fetch School and verify the plan exists and is active
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    });
    if (!school) {
      return NextResponse.json({ message: 'School not found.' }, { status: 404 });
    }

    const planToSubscribe = await prisma.subscriptionPlan.findUnique({
      where: { id: planId, isActive: true },
    });
    if (!planToSubscribe) {
      return NextResponse.json({ message: 'Selected subscription plan not found or is not active.' }, { status: 404 });
    }

    // 2. Create or Retrieve Stripe Customer ID
    let stripeCustomerId = school.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: adminUserOrResponse.email ?? undefined,
        name: school.name,
        metadata: {
          schoolId: school.id,
        },
      });
      stripeCustomerId = customer.id;
      await prisma.school.update({
        where: { id: schoolId },
        data: { stripeCustomerId: stripeCustomerId },
      });
    }

    // 3. Determine success and cancel URLs
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${appUrl}/schools/${schoolId}/admin/payment/success`;
    const cancelUrl = `${appUrl}/schools/${schoolId}/admin/payment/cancel`;


    // 4. Create Stripe Checkout Session
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: planToSubscribe.currency.toLowerCase(), // Stripe expects lowercase currency
          product_data: {
            name: planToSubscribe.name,
            description: `Subscription to ${planToSubscribe.name} for ${school.name}`,
          },
          unit_amount: Math.round(Number(planToSubscribe.price) * 100), // Price in smallest currency unit (e.g., cents)
        },
        quantity: 1,
      },
    ];
    
    // All plans are recurring, so always add recurring details.
      let stripeInterval: 'month' | 'year' | 'week' | 'day';
      switch (planToSubscribe.billingCycle) {
      case BillingCycle.MONTHLY: // Use enum member
          stripeInterval = 'month';
          break;
      case BillingCycle.YEARLY: // Use enum member
          stripeInterval = 'year';
          break;
        // Add cases for 'week' or 'day' if you introduce those BillingCycles
        default:
          // This should not happen if your enum is exhaustive for recurring types
        // and all plans are indeed recurring.
        // Consider logging this unexpected state or throwing a more specific error.
        return NextResponse.json({ message: `Unsupported billing cycle: ${planToSubscribe.billingCycle} for a recurring plan.` }, { status: 500 });
      }
      lineItems[0].price_data!.recurring = {
        interval: stripeInterval,
        interval_count: 1,
      };


    const checkoutSessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription', // Always 'subscription' as all plans are recurring
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        schoolId: school.id,
        planId: planToSubscribe.id,
        userId: adminUserOrResponse.id, // Store the ID of the admin initiating
      },
    };
    
    // If it's a subscription and the plan has a trial period, configure it.
    // This is a basic example; your trial logic might be more complex (e.g., based on plan features).
    // For now, we'll assume 'TRIALING' status is handled by webhook based on plan price or specific flags.
    // If the plan has a trial, Stripe can manage it via `subscription_data.trial_period_days`.
    // Let's say your "Trial" plan in `SubscriptionPlan` has a specific feature or a $0 price and ONE_TIME billing.
    // If you want Stripe to manage the trial for paid plans:
    // if (checkoutSessionParams.mode === 'subscription' && planToSubscribe.trialDays && planToSubscribe.trialDays > 0) {
    //   checkoutSessionParams.subscription_data = {
    //     trial_period_days: planToSubscribe.trialDays,
    //   };
    // }


    const checkoutSession = await stripe.checkout.sessions.create(checkoutSessionParams);

    if (!checkoutSession.url) {
      return NextResponse.json({ message: 'Failed to create Stripe Checkout session.' }, { status: 500 });
    }

    // Return the URL for the frontend to redirect to
    return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url });

  } catch (error: any) {
    console.error(`[API POST /schools/${params.schoolId}/subscriptions/subscribe] Error:`, error);
    let errorMessage = 'Failed to create subscription session.';
    if (error instanceof Stripe.errors.StripeError) {
        errorMessage = `Stripe Error: ${error.message}`;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
        errorMessage = `Database Error: Failed to process subscription. Code: ${error.code}`;
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json({ message: errorMessage, error: error.message || String(error) }, { status: 500 });
  }
} 