import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import prisma from "@/lib/prisma";
import { falPollOnce } from "@/lib/generate";
import {
  downloadAndStore,
  videoKey,
  isStorageConfigured,
} from "@/lib/storage";
import { generateVoiceover } from "@/lib/voice-engine";
import { lipSyncVideo } from "@/lib/lipsync";
import { WELCOME_SCRIPT } from "../route";

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
    // ── Kling is done. Now layer on the user's cloned voice + lip sync. ──
    //
    // Pipeline from here:
    //   1. Persist silent Kling video to Supabase (fallback if lipsync fails)
    //   2. Look up user's cloned voiceId
    //   3. If found: TTS the welcome script with the cloned voice
    //   4. Run FAL sync-lipsync with silent video + cloned audio
    //   5. Persist the final synced video to Supabase
    //   6. Return the synced URL (or silent URL as fallback)

    // Step 1: Persist the silent Kling output
    let silentUrl = pollResult.videoUrl;
    if (isStorageConfigured()) {
      try {
        silentUrl = await downloadAndStore(
          pollResult.videoUrl,
          videoKey(user.id, `${videoId}-silent`, "mp4"),
          "video/mp4"
        );
      } catch (err) {
        console.error("[welcome-video/status] Failed to persist silent video:", err);
      }
    }

    // Step 2: Look up user's default cloned voice
    const voiceSample = await prisma.voiceSample.findFirst({
      where: { userId: user.id, isDefault: true, voiceCloneId: { not: null } },
      select: { voiceCloneId: true },
      orderBy: { createdAt: "desc" },
    });

    let finalUrl = silentUrl;
    let lipsyncError: string | null = null;

    if (voiceSample?.voiceCloneId) {
      console.log(
        `[welcome-video/status] Running TTS + lipsync with voiceId=${voiceSample.voiceCloneId}`
      );

      // Step 3: Generate cloned-voice audio of the welcome script
      const tts = await generateVoiceover(WELCOME_SCRIPT, voiceSample.voiceCloneId);
      if (!tts.audioUrl) {
        lipsyncError = `TTS failed: ${tts.error}`;
        console.error(`[welcome-video/status] ${lipsyncError}`);
      } else {
        // Step 4: Lip-sync the silent video with the cloned audio
        const sync = await lipSyncVideo(silentUrl, tts.audioUrl);
        if (!sync.videoUrl) {
          lipsyncError = `Lipsync failed: ${sync.error}`;
          console.error(`[welcome-video/status] ${lipsyncError}`);
        } else {
          // Step 5: Persist the synced video to Supabase
          let syncedUrl = sync.videoUrl;
          if (isStorageConfigured()) {
            try {
              syncedUrl = await downloadAndStore(
                sync.videoUrl,
                videoKey(user.id, videoId, "mp4"),
                "video/mp4"
              );
            } catch (err) {
              console.error(
                "[welcome-video/status] Failed to persist synced video:",
                err
              );
            }
          }
          finalUrl = syncedUrl;
          console.log(`[welcome-video/status] Lipsync complete: ${finalUrl}`);
        }
      }
    } else {
      console.log(
        "[welcome-video/status] No cloned voice found — serving silent video"
      );
    }

    // Step 6: Update video record and return the final URL
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: "complete",
        videoUrl: finalUrl,
        thumbnailUrl: pollResult.thumbnailUrl || null,
        sourceReview: JSON.stringify({
          ...(JSON.parse((video.sourceReview as string) || "{}")),
          silentUrl,
          lipsynced: finalUrl !== silentUrl,
          lipsyncError,
        }),
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
