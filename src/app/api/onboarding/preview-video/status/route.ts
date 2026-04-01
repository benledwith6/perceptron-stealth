import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import prisma from "@/lib/prisma";
import { falPollOnce } from "@/lib/generate";
import {
  downloadAndStore,
  videoKey,
  isStorageConfigured,
} from "@/lib/storage";

/**
 * GET /api/onboarding/preview-video/status?videoId=xxx
 *
 * Polls FAL for the welcome video job and returns the current status.
 * When complete, persists the video to Supabase Storage and updates
 * the video record.
 */
export async function GET(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, userId: true, status: true, videoUrl: true, sourceReview: true },
  });

  if (!video || video.userId !== user.id) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  // Already complete
  if (video.status === "complete" && video.videoUrl) {
    return NextResponse.json({
      status: "completed",
      videoUrl: video.videoUrl,
    });
  }

  // Already failed
  if (video.status === "failed") {
    return NextResponse.json({ status: "failed", error: "Video generation failed" });
  }

  // Parse the FAL job ID from sourceReview
  let falJobId: string | null = null;
  try {
    const meta = JSON.parse(video.sourceReview as string || "{}");
    falJobId = meta.falJobId || null;
  } catch {
    // ignore
  }

  if (!falJobId) {
    return NextResponse.json({ status: "failed", error: "No FAL job ID found" });
  }

  // Poll FAL
  const pollResult = await falPollOnce(falJobId);

  if (pollResult.status === "completed" && pollResult.videoUrl) {
    // Persist to Supabase Storage
    let finalUrl = pollResult.videoUrl;
    if (isStorageConfigured()) {
      try {
        finalUrl = await downloadAndStore(
          pollResult.videoUrl,
          videoKey(user.id, videoId, "mp4"),
          "video/mp4"
        );
      } catch (err) {
        console.error("[welcome-video/status] Failed to persist video:", err);
      }
    }

    // Update video record
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: "complete",
        videoUrl: finalUrl,
        thumbnailUrl: pollResult.thumbnailUrl || null,
      },
    });

    return NextResponse.json({
      status: "completed",
      videoUrl: finalUrl,
    });
  }

  if (pollResult.status === "failed") {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "failed" },
    });
    return NextResponse.json({
      status: "failed",
      error: pollResult.error || "FAL generation failed",
    });
  }

  // Still processing
  return NextResponse.json({ status: "processing" });
}
