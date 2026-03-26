import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { authLimiter, RateLimitError } from "@/lib/rate-limit";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/auth/forgot-password
 *
 * Generates a secure password reset token, stores it in the DB,
 * and sends a reset email. Always returns the same response
 * regardless of whether the email exists to prevent user enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    try {
      await authLimiter.check(5, ip);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Too many attempts. Please try again later." },
          { status: 429, headers: { "Retry-After": String(err.retryAfter) } }
        );
      }
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { email } = body as { email?: string };

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Always return the same message to prevent user enumeration
    const successMessage =
      "If an account exists for that email, you will receive a password reset link shortly.";

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return NextResponse.json({ message: successMessage });
    }

    // Delete any existing reset tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Generate a new secure token with 1 hour expiry
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Send the reset email (fire-and-forget to not block response)
    sendPasswordResetEmail(
      { email: user.email, firstName: user.firstName },
      token
    ).catch((err) => {
      console.error("[forgot-password] Failed to send reset email:", err);
    });

    return NextResponse.json({ message: successMessage });
  } catch (error) {
    console.error("[POST /api/auth/forgot-password] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
