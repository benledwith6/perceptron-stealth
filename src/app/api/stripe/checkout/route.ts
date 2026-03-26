import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse } from "@/lib/api-helpers";
import { createCheckoutSession, getSafeOrigin, PLAN_CONFIG } from "@/lib/stripe";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  try {
    const body = await req.json();
    const { plan } = body;

    if (!plan || !PLAN_CONFIG[plan]) {
      return errorResponse("Invalid plan. Must be one of: professional, authority, expert", 400);
    }

    if (!PLAN_CONFIG[plan].priceId) {
      return errorResponse(`Stripe price ID not configured for plan: ${plan}`, 500);
    }

    // Fetch full user record to get stripeCustomerId and current plan
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, stripeCustomerId: true, stripeSubscriptionId: true, plan: true },
    });

    if (!dbUser) {
      return errorResponse("User not found", 404);
    }

    // Prevent creating a second subscription if the user already has one.
    // Direct them to the customer portal to change plans instead.
    if (dbUser.stripeSubscriptionId) {
      return errorResponse(
        "You already have an active subscription. Use the billing portal to change plans.",
        409
      );
    }

    // Validate origin to prevent open-redirect attacks
    const origin = getSafeOrigin(req.headers.get("origin"));

    const session = await createCheckoutSession({
      userId: user.id,
      userEmail: dbUser.email,
      plan,
      stripeCustomerId: dbUser.stripeCustomerId,
      successUrl: `${origin}/dashboard/settings?checkout=success`,
      cancelUrl: `${origin}/dashboard/settings?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return errorResponse(err.message || "Failed to create checkout session", 500);
  }
}
