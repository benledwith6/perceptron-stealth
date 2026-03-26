import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { isValidPlatform, exchangeCodeForToken } from "@/lib/social-oauth";
import prisma from "@/lib/prisma";
import crypto from "crypto";

/**
 * Timing-safe string comparison to prevent timing attacks on state parameter.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(
  req: NextRequest,
  { params }: { params: { platform: string } }
) {
  const { error, user } = await requireAuth();
  if (error) {
    return NextResponse.redirect(
      new URL("/auth/login?error=unauthorized", req.url)
    );
  }

  const { platform } = params;
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const settingsUrl = new URL("/dashboard/settings", req.url);
  settingsUrl.searchParams.set("tab", "social");

  // Validate platform FIRST before any other processing to avoid
  // using unsanitized platform names in cookie lookups or error messages
  if (!isValidPlatform(platform)) {
    settingsUrl.searchParams.set("error", "Invalid platform");
    return NextResponse.redirect(settingsUrl);
  }

  // Handle OAuth errors from the provider — do NOT leak provider error details
  // to the redirect URL (could be used for phishing or information disclosure)
  if (oauthError) {
    console.error(`OAuth error from ${platform}:`, searchParams.get("error_description") || oauthError);
    settingsUrl.searchParams.set("error", `${platform} authorization failed. Please try again.`);
    return NextResponse.redirect(settingsUrl);
  }

  if (!code) {
    settingsUrl.searchParams.set("error", "No authorization code received");
    return NextResponse.redirect(settingsUrl);
  }

  // Verify state parameter for CSRF protection
  const storedState = req.cookies.get(`oauth_state_${platform}`)?.value;
  if (!state || !storedState || !timingSafeEqual(storedState, state)) {
    settingsUrl.searchParams.set("error", "Invalid OAuth state. Please try again.");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    // Exchange the authorization code for tokens
    const tokenData = await exchangeCodeForToken(platform, code);

    // Calculate token expiration date
    const expiresAt = tokenData.expiresIn
      ? new Date(Date.now() + tokenData.expiresIn * 1000)
      : null;

    // Upsert the social account record
    await prisma.socialAccount.upsert({
      where: {
        userId_platform: {
          userId: user.id,
          platform,
        },
      },
      update: {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt,
        scope: tokenData.scope,
        accountId: tokenData.accountId,
        handle: tokenData.handle || platform,
        connected: true,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        platform,
        handle: tokenData.handle || platform,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt,
        scope: tokenData.scope,
        accountId: tokenData.accountId,
        connected: true,
      },
    });

    settingsUrl.searchParams.set("success", `${platform} connected successfully`);

    // Clear the state cookie
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(`oauth_state_${platform}`);
    return response;
  } catch (err: any) {
    console.error(`OAuth callback error for ${platform}:`, err);
    // Do not leak internal error details to the redirect URL
    settingsUrl.searchParams.set(
      "error",
      `Failed to connect ${platform}. Please try again.`
    );
    return NextResponse.redirect(settingsUrl);
  }
}
