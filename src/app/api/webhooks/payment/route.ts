import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';
import { SubscriptionStatus, Prisma, BillingCycle } from '@prisma/client';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_WEBHOOK_SECRET) {
  // In a real app, you might want to prevent startup or log a critical error
  // For local dev, this allows the app to run but webhook verification will fail.
  console.warn('CRITICAL: STRIPE_WEBHOOK_SECRET is not set. Webhook verification will fail.');
}

// Helper function to calculate next billing date and end date
function calculateSubscriptionDates(plan: Prisma.SubscriptionPlanGetPayload<{include?: Prisma.SubscriptionPlanInclude | undefined; select?: Prisma.SubscriptionPlanSelect | undefined;}>, startDateInput?: Date): { startDate: Date; endDate: Date | null; nextBillingDate: Date } {
  const startDate = startDateInput || new Date();
  let endDate: Date | null = null;
  let nextBillingDate: Date;

  switch (plan.billingCycle) {
    case BillingCycle.MONTHLY:
      nextBillingDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate());
      break;
    case BillingCycle.YEARLY:
      nextBillingDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
      break;
    default:
      console.error(`[calculateSubscriptionDates] Unexpected billing cycle: ${plan.billingCycle} for plan ID: ${plan.id}`);
      throw new Error(`Unsupported billing cycle encountered: ${plan.billingCycle}`);
  }
  return { startDate, endDate, nextBillingDate };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event: Stripe.Event;

  try {
    if (!STRIPE_WEBHOOK_SECRET) {
        // This check is more for runtime robustness if the initial throw didn't stop the app (e.g. in some serverless envs)
        console.error("[Webhook] STRIPE_WEBHOOK_SECRET is not configured.");
        return NextResponse.json({ error: "Webhook secret not configured." }, { status: 500 });
    }
    if (!signature) {
      throw new Error("Missing stripe-signature header");
    }
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error(`[Webhook] Error verifying signature: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  console.log(`[Webhook] Received event: ${event.type}, ID: ${event.id}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        const schoolId = session.metadata?.schoolId;
        const planId = session.metadata?.planId;
        const userId = session.metadata?.userId; // Admin who initiated

        if (!schoolId || !planId || !userId) {
          console.error('[Webhook checkout.session.completed] Missing metadata:', { schoolId, planId, userId, sessionId: session.id });
          return NextResponse.json({ error: 'Webhook error: Missing required metadata in session.' }, { status: 400 });
        }

        const planSubscribed = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!planSubscribed) {
          console.error(`[Webhook checkout.session.completed] Plan ID ${planId} not found. Session ID: ${session.id}`);
          return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
        }
        
        const paymentGatewaySubscriptionId = session.subscription ? String(session.subscription) : session.payment_intent ? `pi_${String(session.payment_intent)}` : `cs_${session.id}`;

        if (session.mode === 'subscription' && session.subscription) {
            const existingGatewaySub = await prisma.schoolSubscription.findFirst({
                where: { stripeSubscriptionId: String(session.subscription) }
            });
            if (existingGatewaySub) {
                console.log(`[Webhook checkout.session.completed] Subscription ${session.subscription} already processed for school ${existingGatewaySub.schoolId}. Skipping.`);
                return NextResponse.json({ received: true, message: "Already processed." });
            }
        }

        await prisma.$transaction(async (tx) => {
          const activeStatuses: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE];
          await tx.schoolSubscription.updateMany({
            where: { schoolId: schoolId, status: { in: activeStatuses } },
            data: { status: SubscriptionStatus.CANCELED, endDate: new Date() },
          });
          console.log(`[Webhook checkout.session.completed] Deactivated existing subscriptions for school ${schoolId}. Session ID: ${session.id}`);

          const { startDate, endDate, nextBillingDate } = calculateSubscriptionDates(planSubscribed);
          
          let newStatus: SubscriptionStatus = SubscriptionStatus.ACTIVE;
          if (Number(planSubscribed.price) === 0) {
            newStatus = SubscriptionStatus.TRIALING;
          }

          await tx.schoolSubscription.create({
            data: {
              schoolId: schoolId,
              subscriptionPlanId: planId,
              status: newStatus,
              currentPeriodStart: startDate,
              currentPeriodEnd: nextBillingDate,
              endDate: endDate,
              nextBillingDate: nextBillingDate,
              stripeSubscriptionId: paymentGatewaySubscriptionId,
            },
          });
          console.log(`[Webhook checkout.session.completed] Created new subscription for school ${schoolId} to plan ${planId}. Stripe Sub ID: ${paymentGatewaySubscriptionId}. Session ID: ${session.id}`);
          
          if (session.customer && typeof session.customer === 'string') {
             const schoolData = await tx.school.findUnique({where: {id: schoolId}, select: {stripeCustomerId: true}});
             if (schoolData && !schoolData.stripeCustomerId) {
                 await tx.school.update({
                     where: {id: schoolId},
                     data: {stripeCustomerId: session.customer}
                 });
                 console.log(`[Webhook checkout.session.completed] Updated school ${schoolId} with stripeCustomerId ${session.customer}. Session ID: ${session.id}`);
             }
          }
        });
        break;

      case 'invoice.payment_succeeded':
        const invoiceSucceeded = event.data.object as Stripe.Invoice;
        let succeededStripeSubId: string | null = null;
        const invSubscription = (invoiceSucceeded as any).subscription; // Use type assertion
        if (invSubscription) {
          if (typeof invSubscription === 'string') {
            succeededStripeSubId = invSubscription;
          } else if (typeof invSubscription === 'object' && invSubscription.id) {
            succeededStripeSubId = invSubscription.id;
          }
        }

        if (succeededStripeSubId && invoiceSucceeded.billing_reason === 'subscription_cycle') {
          const currentSchoolSub = await prisma.schoolSubscription.findFirst({
            where: { stripeSubscriptionId: succeededStripeSubId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] } },
            include: { subscriptionPlan: true },
          });

          if (currentSchoolSub && currentSchoolSub.subscriptionPlan) {
            const { nextBillingDate: newNextBillingDate, endDate: newEndDate } = calculateSubscriptionDates(currentSchoolSub.subscriptionPlan, new Date(invoiceSucceeded.period_end * 1000));
            await prisma.schoolSubscription.update({
              where: { id: currentSchoolSub.id },
              data: {
                status: SubscriptionStatus.ACTIVE,
                nextBillingDate: newNextBillingDate,
                endDate: newEndDate,
              },
            });
            console.log(`[Webhook invoice.payment_succeeded] Renewed subscription ${succeededStripeSubId} for school ${currentSchoolSub.schoolId}. Next billing: ${newNextBillingDate}`);
          } else {
            console.warn(`[Webhook invoice.payment_succeeded] No active/past_due SchoolSubscription found for Stripe Sub ID: ${succeededStripeSubId} or plan not loaded.`);
          }
        } else {
             console.log(`[Webhook invoice.payment_succeeded] Received for non-subscription cycle or missing subscription ID. Billing reason: ${invoiceSucceeded.billing_reason}. Sub ID: ${succeededStripeSubId}`);
        }
        break;

      case 'invoice.payment_failed':
        const invoiceFailed = event.data.object as Stripe.Invoice;
        let failedStripeSubId: string | null = null;
        const invFailedSubscription = (invoiceFailed as any).subscription; // Use type assertion
        if (invFailedSubscription) {
          if (typeof invFailedSubscription === 'string') {
            failedStripeSubId = invFailedSubscription;
          } else if (typeof invFailedSubscription === 'object' && invFailedSubscription.id) {
            failedStripeSubId = invFailedSubscription.id;
          }
        }

        if (failedStripeSubId) {
          await prisma.schoolSubscription.updateMany({
            where: { stripeSubscriptionId: failedStripeSubId, status: SubscriptionStatus.ACTIVE },
            data: { status: SubscriptionStatus.PAST_DUE },
          });
          console.log(`[Webhook invoice.payment_failed] Set subscription ${failedStripeSubId} to PAST_DUE.`);
        } else {
            console.log(`[Webhook invoice.payment_failed] Received for non-subscription or missing subscription ID.`);
        }
        break;
      
      case 'customer.subscription.updated':
        const subUpdated = event.data.object as Stripe.Subscription;
        const existingSchoolSubForUpdate = await prisma.schoolSubscription.findUnique({
            where: {stripeSubscriptionId: subUpdated.id},
            include: { subscriptionPlan: true }
        });

        if (existingSchoolSubForUpdate && existingSchoolSubForUpdate.subscriptionPlan) {
            let newStatus = existingSchoolSubForUpdate.status;
            let newEndDate = existingSchoolSubForUpdate.endDate;
            let newPlanId = existingSchoolSubForUpdate.subscriptionPlanId;

            if (subUpdated.status === 'active') newStatus = SubscriptionStatus.ACTIVE;
            else if (subUpdated.status === 'past_due') newStatus = SubscriptionStatus.PAST_DUE;
            else if (subUpdated.status === 'trialing') newStatus = SubscriptionStatus.TRIALING;
            else if (subUpdated.status === 'canceled') {
                newStatus = SubscriptionStatus.CANCELED;
                newEndDate = subUpdated.ended_at ? new Date(subUpdated.ended_at * 1000) : new Date();
            } else if (subUpdated.cancel_at_period_end && subUpdated.cancel_at) {
                newEndDate = new Date(subUpdated.cancel_at * 1000);
                console.log(`[Webhook customer.subscription.updated] Subscription ${subUpdated.id} for school ${existingSchoolSubForUpdate.schoolId} is set to cancel at period end: ${newEndDate}. Status remains ${newStatus}.`);
            }

            const currentPeriodEndTimestamp = (subUpdated as any).current_period_end;

            await prisma.schoolSubscription.update({
                where: {id: existingSchoolSubForUpdate.id},
                data: {
                    status: newStatus,
                    endDate: newEndDate,
                    nextBillingDate: currentPeriodEndTimestamp ? new Date(currentPeriodEndTimestamp * 1000) : existingSchoolSubForUpdate.nextBillingDate,
                    subscriptionPlanId: newPlanId,
                }
            });
             console.log(`[Webhook customer.subscription.updated] Updated SchoolSubscription ${existingSchoolSubForUpdate.id} based on Stripe sub ${subUpdated.id}. New status: ${newStatus}, Plan: ${newPlanId}`);
        } else {
            console.warn(`[Webhook customer.subscription.updated] No SchoolSubscription found for Stripe Sub ID: ${subUpdated.id} or plan not loaded. This might be a new subscription created directly in Stripe.`);
        }
        break;

      case 'customer.subscription.deleted':
        const subDeleted = event.data.object as Stripe.Subscription;
        await prisma.schoolSubscription.updateMany({
          where: { stripeSubscriptionId: subDeleted.id },
          data: {
            status: SubscriptionStatus.CANCELED,
            endDate: subDeleted.ended_at ? new Date(subDeleted.ended_at * 1000) : new Date(),
          },
        });
        console.log(`[Webhook customer.subscription.deleted] Marked subscription ${subDeleted.id} as CANCELED.`);
        break;

      default:
        console.warn(`[Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (dbError: any) {
    console.error(`[Webhook] Database/processing error for event: ${event.type}, ID: ${event.id}`, dbError);
    return NextResponse.json({ error: 'Webhook processing error. Event: ' + event.type }, { status: 500 });
  }

  return NextResponse.json({ received: true });
} 