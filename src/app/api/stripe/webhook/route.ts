import { NextRequest, NextResponse } from "next/server";
import { stripe, planFromPriceId } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import Stripe from "stripe";

/**
 * Stripe sends webhook payloads as raw body, so we must NOT parse
 * the body as JSON ourselves -- we read it as text for signature
 * verification.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        // Unhandled event type -- acknowledge receipt
        break;
    }
  } catch (err: any) {
    console.error(`Error handling webhook event ${event.type}:`, err);
    // Return 500 so Stripe retries for transient failures.
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * When a checkout session completes, persist the Stripe customer ID,
 * subscription ID, and the chosen plan on the User record.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) {
    // Throw so we return 500 and Stripe retries -- the metadata should
    // always be present, so this likely indicates a transient issue.
    throw new Error("checkout.session.completed: No userId in metadata");
  }

  const plan = session.metadata?.plan;
  if (!plan) {
    throw new Error("checkout.session.completed: No plan in metadata");
  }

  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  // Use updateMany-style atomic update to avoid race conditions.
  // The where clause ensures we only update if the user exists.
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
  });

  console.log(`User ${userId} upgraded to ${plan}`);
}

/**
 * When a subscription is updated (e.g. plan change, renewal),
 * sync the plan in our database to match Stripe.
 *
 * Also checks subscription status -- if the subscription is no longer
 * active (e.g. past_due, unpaid, canceled), downgrade accordingly.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // If the subscription is no longer active, treat it as effectively cancelled
  const activeStatuses: Stripe.Subscription.Status[] = ["active", "trialing"];
  if (!activeStatuses.includes(subscription.status)) {
    // Downgrade to free for non-active statuses (past_due, unpaid, canceled, etc.)
    const updated = await prisma.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        plan: "free",
        // Keep stripeSubscriptionId so we can still look up the sub
        stripeSubscriptionId: subscription.id,
      },
    });

    if (updated.count === 0) {
      console.error(`subscription.updated: No user found for customer ${customerId}`);
    } else {
      console.log(
        `User with customer ${customerId} subscription status changed to ${subscription.status}, downgraded to free`
      );
    }
    return;
  }

  // Determine the new plan from the subscription's price
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) {
    console.error(`subscription.updated: No price ID found on subscription ${subscription.id}`);
    return;
  }

  const plan = planFromPriceId(priceId);
  if (!plan) {
    // Unknown price ID -- log an error but do NOT silently downgrade to free.
    // This could be a configuration mismatch that needs attention.
    console.error(
      `subscription.updated: Unknown price ID ${priceId} on subscription ${subscription.id}. ` +
        `Check that STRIPE_PRICE_* env vars match your Stripe dashboard.`
    );
    return;
  }

  // Atomic update using stripeCustomerId directly to avoid find-then-update race condition
  const updated = await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      plan,
      stripeSubscriptionId: subscription.id,
    },
  });

  if (updated.count === 0) {
    console.error(`subscription.updated: No user found for customer ${customerId}`);
    return;
  }

  console.log(`User with customer ${customerId} subscription updated to ${plan}`);
}

/**
 * When a subscription is deleted (cancelled), downgrade the user to free.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Atomic update -- no find-then-update race condition
  const updated = await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      plan: "free",
      stripeSubscriptionId: null,
    },
  });

  if (updated.count === 0) {
    console.error(`subscription.deleted: No user found for customer ${customerId}`);
    return;
  }

  console.log(`Customer ${customerId} subscription cancelled, downgraded to free`);
}

/**
 * When an invoice payment fails, downgrade the user to free to prevent
 * continued access to paid features with an unpaid subscription.
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) {
    console.error("invoice.payment_failed: No customer ID on invoice");
    return;
  }

  // Only act on subscription invoices, not one-off invoices
  if (!invoice.subscription) {
    return;
  }

  const updated = await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      plan: "free",
    },
  });

  if (updated.count === 0) {
    console.error(`invoice.payment_failed: No user found for customer ${customerId}`);
    return;
  }

  console.log(`Customer ${customerId} payment failed, downgraded to free`);
}
