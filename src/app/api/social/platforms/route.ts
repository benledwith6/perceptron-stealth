import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { isPlatformConfigured } from "@/lib/social-oauth";

/**
 * GET /api/social/platforms
 *
 * Returns the configuration status for each social platform.
 * The client uses this to show disabled states and helpful tooltips
 * when OAuth credentials are not yet configured.
 */

const ALL_PLATFORMS = ["instagram", "youtube", "tiktok", "linkedin", "facebook"] as const;

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const platforms = ALL_PLATFORMS.map((platform) => {
    const { configured } = isPlatformConfigured(platform);
    // Do not expose missingVars (env var names) to the client —
    // only indicate whether the platform is configured or not
    return { platform, configured };
  });

  return NextResponse.json(platforms);
}
