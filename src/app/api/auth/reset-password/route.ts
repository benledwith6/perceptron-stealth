import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { authLimiter, RateLimitError } from "@/lib/rate-limit";
import { z } from "zod";

const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  currentPassword: z.string().min(1, "Current password is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

/**
 * POST /api/auth/reset-password
 *
 * Password reset that requires the user's current password for verification.
 * Accepts { email, currentPassword, password } and updates the user's password
 * only if the current password is correct.
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP to prevent brute-force password changes
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    try {
      await authLimiter.check(3, ip);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Too many attempts. Please try again later." },
          { status: 429, headers: { "Retry-After": String(err.retryAfter) } }
        );
      }
      throw err;
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

    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError =
        Object.values(fieldErrors).flat()[0] || "Invalid input";
      return NextResponse.json(
        { error: firstError, fieldErrors },
        { status: 400 }
      );
    }

    const { email, currentPassword, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Prevent setting the same password
    if (currentPassword === password) {
      return NextResponse.json(
        { error: "New password must be different from your current password" },
        { status: 400 }
      );
    }

    // Look up the user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Use consistent response shape and timing to avoid leaking account existence.
      // Hash a dummy password to keep timing consistent with the success path.
      await bcrypt.hash("dummy-timing-equalization", 12);
      return NextResponse.json({
        message:
          "If an account exists for that email and the current password is correct, the password has been reset.",
      });
    }

    // Verify the current password
    const isCurrentValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!isCurrentValid) {
      return NextResponse.json({
        message:
          "If an account exists for that email and the current password is correct, the password has been reset.",
      });
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update the user's password
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({
      message:
        "If an account exists for that email and the current password is correct, the password has been reset.",
    });
  } catch (error) {
    console.error("[POST /api/auth/reset-password] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
