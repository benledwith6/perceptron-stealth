import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { isValidPlatform } from "@/lib/social-oauth";
import prisma from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { platform: string } }
) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const { platform } = params;

  if (!isValidPlatform(platform)) {
    return NextResponse.json(
      { error: `Invalid platform: ${platform}` },
      { status: 400 }
    );
  }

  try {
    // Use deleteMany to atomically delete without a prior lookup,
    // avoiding a race condition where another request could delete
    // between a findUnique and delete call.
    const result = await prisma.socialAccount.deleteMany({
      where: {
        userId: user.id,
        platform,
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: `No ${platform} account connected` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: `${platform} disconnected` });
  } catch (err: any) {
    console.error(`Disconnect error for ${platform}:`, err);
    return NextResponse.json(
      { error: `Failed to disconnect ${platform}` },
      { status: 500 }
    );
  }
}
