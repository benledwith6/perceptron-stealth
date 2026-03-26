import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { publishSchema } from "@/lib/validations";
import { validateBody } from "@/lib/validate";
import {
  getAccounts,
  uploadMedia,
  createPost,
  getPostResults,
} from "@/lib/post-bridge";

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validation = validateBody(publishSchema, body);
    if (validation.error) {
      return NextResponse.json(
        { error: validation.error, fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const { videoId, platforms, scheduledAt, caption } = validation.data;

    // 1. Look up the video
    const video = await prisma.video.findFirst({
      where: { id: videoId, userId: user.id },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (!video.videoUrl) {
      return NextResponse.json(
        { error: "Video has no generated file yet. Generate the video first." },
        { status: 400 }
      );
    }

    // 2. Get Post Bridge accounts for the requested platforms
    let pbAccounts;
    try {
      pbAccounts = await getAccounts(platforms);
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to fetch Post Bridge accounts: ${err.message}` },
        { status: 502 }
      );
    }

    if (!pbAccounts.length) {
      return NextResponse.json(
        {
          error: "No connected accounts found on Post Bridge for the requested platforms. Connect your accounts at post-bridge.com first.",
          requestedPlatforms: platforms,
        },
        { status: 400 }
      );
    }

    // Match PB accounts to requested platforms
    const matchedAccounts = pbAccounts.filter((a) =>
      platforms.includes(a.platform as any)
    );

    if (!matchedAccounts.length) {
      return NextResponse.json(
        {
          error: "None of your Post Bridge accounts match the requested platforms.",
          available: pbAccounts.map((a) => a.platform),
          requested: platforms,
        },
        { status: 400 }
      );
    }

    // 3. Upload video to Post Bridge
    let mediaId: string;
    try {
      mediaId = await uploadMedia(
        video.videoUrl,
        `${video.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`
      );
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to upload video to Post Bridge: ${err.message}` },
        { status: 502 }
      );
    }

    // 4. Build caption
    const postCaption = caption || [video.title, video.description].filter(Boolean).join("\n\n");

    // 5. Create the post
    let pbPost;
    try {
      pbPost = await createPost({
        caption: postCaption,
        socialAccountIds: matchedAccounts.map((a) => a.id),
        mediaIds: [mediaId],
        scheduledAt: scheduledAt || null,
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to create post on Post Bridge: ${err.message}` },
        { status: 502 }
      );
    }

    // 6. Update our database
    const isImmediate = !scheduledAt;

    if (isImmediate) {
      // Mark video as published
      await prisma.video.update({
        where: { id: videoId },
        data: { status: "published" },
      });
    }

    // Upsert a single schedule record for this video.
    // The schedule model has a unique videoId constraint, so we store
    // the comma-joined platform list to represent multi-platform publishing.
    const platformList = matchedAccounts.map((a) => a.platform).join(",");

    await prisma.schedule.upsert({
      where: { videoId },
      update: {
        platform: platformList,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
        status: isImmediate ? "published" : "scheduled",
        publishedAt: isImmediate ? new Date() : null,
      },
      create: {
        videoId,
        userId: user.id,
        platform: platformList,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
        status: isImmediate ? "published" : "scheduled",
        publishedAt: isImmediate ? new Date() : null,
      },
    });

    // 7. Return result
    return NextResponse.json({
      success: true,
      postBridgePostId: pbPost.id,
      status: isImmediate ? "published" : "scheduled",
      platforms: matchedAccounts.map((a) => ({
        platform: a.platform,
        username: a.username,
      })),
      mediaId,
    });
  } catch (error) {
    console.error("[POST /api/publish] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    // Return all schedules with their videos for this user
    const schedules = await prisma.schedule.findMany({
      where: { userId: user.id },
      include: { video: true },
      orderBy: { scheduledAt: "desc" },
    });

    return NextResponse.json(schedules);
  } catch (error) {
    console.error("[GET /api/publish] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
