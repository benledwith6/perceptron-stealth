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
    // SPEED WIN: return the FAL URL to the client immediately (saves the
    // ~4-9s Supabase download+upload round-trip from user-visible time).
    // The client can start playing the video right away.
    //
    // In the background (via `unstable_after`), we still persist the mp4
    // to Supabase Storage and update the Video row with the durable URL.
    // If the user reloads later, they'll play from Supabase — not from
    // FAL's CDN, which expires.
    const falVideoUrl = pollResult.videoUrl;
    const falThumbUrl = pollResult.thumbnailUrl || null;

    // Mark the video complete using the FAL URL for now. If the async
    // re-upload below succeeds, it'll be swapped to the Supabase URL.
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: "complete",
        videoUrl: falVideoUrl,
        thumbnailUrl: falThumbUrl,
      },
    });

    // Fire-and-forget the Supabase re-upload. In Next's long-lived dev
    // server (Node runtime) the async work continues until it completes,
    // well after we return the response to the client.
    //
    // PRODUCTION NOTE: on Vercel serverless, the function may be frozen
    // right after `return`. Migrate to `next/server`'s `unstable_after`
    // (Next 15) or a proper background queue before shipping to prod.
    if (isStorageConfigured()) {
      downloadAndStore(
        falVideoUrl,
        videoKey(user.id, videoId, "mp4"),
        "video/mp4"
      )
        .then((supabaseUrl) =>
          prisma.video
            .update({
              where: { id: videoId },
              data: { videoUrl: supabaseUrl },
            })
            .then(() =>
              console.log(
                `[welcome-video/status] Background re-upload complete: ${supabaseUrl}`
              )
            )
        )
        .catch((err) => {
          // If this fails the Video row keeps the FAL URL. FAL URLs can
          // expire — log loudly so we notice and can implement a retry.
          console.error(
            "[welcome-video/status] Background re-upload FAILED (video still points at FAL CDN):",
            err
          );
        });
    }

    return NextResponse.json({
      status: "completed",
      videoUrl: falVideoUrl,
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
