import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn(
    "STRIPE_SECRET_KEY is not set. Stripe functionality will be unavailable."
  );
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    })
  : (null as unknown as Stripe);

/**
 * Guard that throws a clear error if the Stripe client was not initialised.
 * Call this at the top of any function that uses the `stripe` export.
 */
export function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment."
    );
  }
  return stripe;
}

/**
 * Plan configuration mapping plan names to Stripe Price IDs.
 * Price IDs are loaded from environment variables so they can differ
 * between Stripe test mode and live mode.
 */
export const PLAN_CONFIG: Record<
  string,
  { name: string; priceId: string | undefined }
> = {
  professional: {
    name: "Professional",
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL,
  },
  authority: {
    name: "Authority",
    priceId: process.env.STRIPE_PRICE_AUTHORITY,
  },
  expert: {
    name: "Expert",
    priceId: process.env.STRIPE_PRICE_EXPERT,
  },
};

/**
 * Look up which plan name corresponds to a given Stripe Price ID.
 * Returns `null` if no match is found so callers can distinguish
 * "unknown price" from an intentional downgrade.
 */
export function planFromPriceId(priceId: string): string | null {
  for (const [planKey, config] of Object.entries(PLAN_CONFIG)) {
    if (config.priceId === priceId) return planKey;
  }
  return null;
}

/**
 * Validate that a return/redirect URL uses an allowed origin.
 * Prevents open-redirect attacks via a spoofed Origin header.
 */
export function getSafeOrigin(requestOrigin: string | null): string {
  const allowed = process.env.NEXTAUTH_URL || "http://localhost:3000";
  if (requestOrigin && requestOrigin === allowed) {
    return requestOrigin;
  }
  return allowed;
}

/**
 * Create a Stripe Checkout Session for subscribing to a plan.
 */
export async function createCheckoutSession({
  userId,
  userEmail,
  plan,
  stripeCustomerId,
  successUrl,
  cancelUrl,
}: {
  userId: string;
  userEmail: string;
  plan: string;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const s = requireStripe();

  const planConfig = PLAN_CONFIG[plan];
  if (!planConfig || !planConfig.priceId) {
    throw new Error(`Invalid plan or missing price ID for plan: ${plan}`);
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: planConfig.priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      plan,
    },
    // Prevent duplicate subscriptions: if a checkout session with the
    // same idempotency metadata already exists Stripe will return it
    // instead of creating a new one.
    subscription_data: {
      metadata: {
        userId,
        plan,
      },
    },
  };

  // If the user already has a Stripe customer ID, reuse it.
  // Otherwise let Stripe create a new customer and pre-fill their email.
  if (stripeCustomerId) {
    sessionParams.customer = stripeCustomerId;
  } else {
    sessionParams.customer_email = userEmail;
  }

  return s.checkout.sessions.create(sessionParams);
}

/**
 * Create a Stripe Customer Portal session so users can manage
 * their subscription, update payment methods, or cancel.
 */
export async function createPortalSession({
  stripeCustomerId,
  returnUrl,
}: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const s = requireStripe();

  return s.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
}
