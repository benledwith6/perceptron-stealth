import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { uploadMedia, createPost, getAccounts } from "@/lib/post-bridge";

export async function POST(
  _req: NextRequest,
  { params }: { params: { scheduleId: string } }
) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    if (!params.scheduleId) {
      return NextResponse.json(
        { error: "Schedule ID is required" },
        { status: 400 }
      );
    }

    // 1. Look up the schedule
    const schedule = await prisma.schedule.findFirst({
      where: { id: params.scheduleId, userId: user.id },
      include: { video: true },
    });

    if (!schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    if (schedule.status === "published") {
      return NextResponse.json(
        { error: "This post has already been published" },
        { status: 400 }
      );
    }

    if (!schedule.video.videoUrl) {
      return NextResponse.json(
        { error: "Video has no generated file yet" },
        { status: 400 }
      );
    }

    // 2. Find matching Post Bridge account
    let pbAccounts;
    try {
      pbAccounts = await getAccounts([schedule.platform]);
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to fetch Post Bridge accounts: ${err.message}` },
        { status: 502 }
      );
    }

    if (!pbAccounts.length) {
      return NextResponse.json(
        {
          error: `No connected ${schedule.platform} account found on Post Bridge.`,
        },
        { status: 400 }
      );
    }

    // 3. Upload and publish
    let mediaId: string;
    try {
      mediaId = await uploadMedia(
        schedule.video.videoUrl,
        `${schedule.video.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`
      );
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to upload video to Post Bridge: ${err.message}` },
        { status: 502 }
      );
    }

    const caption = [schedule.video.title, schedule.video.description]
      .filter(Boolean)
      .join("\n\n");

    let pbPost;
    try {
      pbPost = await createPost({
        caption,
        socialAccountIds: [pbAccounts[0].id],
        mediaIds: [mediaId],
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to create post on Post Bridge: ${err.message}` },
        { status: 502 }
      );
    }

    // 4. Update schedule and video status
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: {
        status: "published",
        publishedAt: new Date(),
      },
    });

    await prisma.video.update({
      where: { id: schedule.videoId },
      data: { status: "published" },
    });

    return NextResponse.json({
      success: true,
      postBridgePostId: pbPost.id,
      platform: schedule.platform,
      publishedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/publish/:scheduleId] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
