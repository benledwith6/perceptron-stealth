import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { generateVideo } from "@/lib/generate";
import { expandCutPrompts, planComposition } from "@/lib/video-compositor";
import { getOrGenerateStartingFrame } from "@/lib/starting-frame";
import { stitchCuts, isShotstackConfigured, StitchCut } from "@/lib/video-stitcher";
import { downloadAndStore, videoKey, audioKey, thumbnailKey, isStorageConfigured } from "@/lib/storage";
import { generateVoiceover } from "@/lib/voice-engine";

/**
 * POST /api/generate/process — HEAVY LIFTING
 *
 * Takes a videoId and runs ONE step of the pipeline per call:
 *   step=expand  → Expand prompts via Gemini (~3-5s)
 *   step=tts     → Generate TTS audio (~5-10s)
 *   step=cut&i=0 → Generate video cut #i via FAL (submits async, ~1s)
 *   step=poll&i=0 → Poll FAL for cut #i completion (~1s per poll)
 *   step=stitch  → Stitch all cuts via Shotstack (~1s to submit)
 *
 * Frontend calls these sequentially, staying within the 26s timeout.
 *
 * Error handling: If any step throws, the video is marked as "failed" with the
 * error message stored in sourceReview metadata. This prevents videos from
 * getting stuck in "generating" forever.
 */

/**
 * Helper to mark a video as failed and store the error in sourceReview metadata.
 */
async function markVideoFailed(videoId: string, errorMessage: string, existingMeta?: string | null): Promise<void> {
  const meta = existingMeta ? safeParseJson(existingMeta) : {};
  meta.error = errorMessage;
  await prisma.video.update({
    where: { id: videoId },
    data: {
      status: "failed",
      sourceReview: JSON.stringify(meta),
    },
  });
}

function safeParseJson(str: string): Record<string, any> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  let videoId: string | undefined;
  let videoSourceReview: string | null = null;

  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { videoId: vid, step, cutIndex } = body as { videoId: string; step: string; cutIndex?: number };
    videoId = vid;

    if (!videoId || !step) {
      return NextResponse.json({ error: "videoId and step are required" }, { status: 400 });
    }

    const video = await prisma.video.findFirst({ where: { id: videoId, userId: user.id } });
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    videoSourceReview = video.sourceReview;

    const selectedModel = video.model || "kling_2.6";
    const selectedFormat = video.contentType || "talking_head_15";
    const rawScript = video.script || "";

    // Helper: update pipeline progress in sourceReview metadata.
    // Reads the latest metadata from DB to avoid overwriting concurrent updates.
    const updatePipelineProgress = async (pipelineStep: string, pipelineCut?: number) => {
      if (!videoId) return; // guard against undefined videoId
      const fresh = await prisma.video.findUnique({
        where: { id: videoId },
        select: { sourceReview: true },
      });
      const existing = fresh?.sourceReview ? safeParseJson(fresh.sourceReview as string) : {};
      existing.pipelineStep = pipelineStep;
      if (pipelineCut !== undefined) existing.pipelineCut = pipelineCut;
      await prisma.video.update({
        where: { id: videoId },
        data: { sourceReview: JSON.stringify(existing) },
      });
    };

    // ─── STEP: EXPAND ─────────────────────────────────────────
    if (step === "expand") {
      await updatePipelineProgress("expand");
      const plan = planComposition(selectedFormat, rawScript);
      const expandedPlan = await expandCutPrompts(plan, user.id, selectedModel, user.industry);

      // Store expanded prompts in the video's script field
      const allPrompts = expandedPlan.format.cuts.map((c, i) =>
        `═══ CUT ${i + 1}: ${c.type.toUpperCase()} (${c.duration}s) ═══\n${c.prompt}`
      ).join("\n\n");

      // Store cut data as JSON in description for later steps
      const cutData = expandedPlan.format.cuts.map(c => ({
        index: c.index,
        type: c.type,
        duration: c.duration,
        generateDuration: c.generateDuration,
        prompt: c.prompt,
      }));

      await prisma.video.update({
        where: { id: videoId },
        data: {
          script: allPrompts.substring(0, 5000),
          sourceReview: JSON.stringify({
            cuts: cutData,
            format: selectedFormat,
            pipelineStep: "expand",
            pipelineCut: 0,
          }),
        },
      });

      return NextResponse.json({
        status: "expanded",
        totalCuts: cutData.length,
        nextStep: "tts",
      });
    }

    // ─── STEP: TTS ────────────────────────────────────────────
    if (step === "tts") {
      await updatePipelineProgress("tts");
      let ttsAudioUrl: string | null = null;

      if (rawScript && rawScript.length > 10) {
        try {
          const ttsResult = await generateVoiceover(rawScript);
          if (ttsResult.audioUrl) {
            if (isStorageConfigured() && !ttsResult.audioUrl.startsWith("data:")) {
              try {
                ttsAudioUrl = await downloadAndStore(
                  ttsResult.audioUrl,
                  audioKey(user.id, `tts-${Date.now()}`, "mp3"),
                  "audio/mpeg"
                );
              } catch (err) {
                console.error("[process/tts] Failed to persist TTS audio to storage, using temp URL:", err);
                ttsAudioUrl = ttsResult.audioUrl;
              }
            } else {
              ttsAudioUrl = ttsResult.audioUrl;
            }
          }
        } catch (err) {
          console.error("[process/tts] TTS failed:", err);
          // TTS failure is non-fatal — continue without audio
        }
      }

      // Store TTS URL in metadata — re-read from DB to avoid overwriting
      // expand step's metadata (race condition: video.sourceReview is stale)
      const freshVideo = await prisma.video.findUnique({
        where: { id: videoId },
        select: { sourceReview: true },
      });
      const existing = freshVideo?.sourceReview ? safeParseJson(freshVideo.sourceReview as string) : {};
      existing.ttsAudioUrl = ttsAudioUrl;
      await prisma.video.update({
        where: { id: videoId },
        data: { sourceReview: JSON.stringify(existing) },
      });

      return NextResponse.json({
        status: "tts_done",
        hasAudio: !!ttsAudioUrl,
        nextStep: "cut",
        nextCutIndex: 0,
      });
    }

    // ─── STEP: CUT (generate one video cut) ───────────────────
    if (step === "cut") {
      const i = cutIndex ?? 0;
      // Re-read sourceReview from DB to get latest metadata (expand step may have updated it)
      const freshForCut = await prisma.video.findUnique({
        where: { id: videoId },
        select: { sourceReview: true },
      });
      const meta = freshForCut?.sourceReview ? safeParseJson(freshForCut.sourceReview as string) : {};
      const cuts = meta.cuts || [];
      const cut = cuts[i];

      if (!cut) {
        return NextResponse.json({ error: `Cut ${i} not found` }, { status: 400 });
      }

      await updatePipelineProgress("cut", i);

      // ── Resolve the image URL to pass to FAL as the reference frame ──
      let photoUrl: string = "";

      // Try starting frame first (cached or generate on first cut)
      if (i === 0) {
        const sfUrl = await getOrGenerateStartingFrame(user.id);
        if (sfUrl) {
          photoUrl = sfUrl;
          meta.startingFrameUrl = sfUrl;
          await prisma.video.update({
            where: { id: videoId },
            data: { sourceReview: JSON.stringify(meta) },
          });
        }
      } else if (meta.startingFrameUrl) {
        photoUrl = meta.startingFrameUrl;
      }

      // Fallback: use the video's photoId or user's primary photo
      if (!photoUrl) {
        const photo = video.photoId
          ? await prisma.photo.findFirst({ where: { id: video.photoId } })
          : await prisma.photo.findFirst({ where: { userId: user.id, isPrimary: true } });
        photoUrl = photo?.url || "";
        if (photoUrl) {
          console.warn(`[process/cut] No starting frame available for cut ${i}. Falling back to user photo.`);
        } else {
          console.error(`[process/cut] No photo URL available for cut ${i}. Video generation may produce inconsistent results.`);
        }
      }

      // ── Fetch character sheets + reference photo for character consistency ──
      let referencePhotoUrl = "";
      const characterSheetUrls: string[] = [];

      // Get the user's primary/selected reference photo
      const refPhoto = video.photoId
        ? await prisma.photo.findFirst({ where: { id: video.photoId } })
        : await prisma.photo.findFirst({ where: { userId: user.id, isPrimary: true } });
      if (refPhoto?.url) {
        referencePhotoUrl = refPhoto.url;
      }

      // Get both character sheets (poses + 360)
      const characterSheets = await prisma.characterSheet.findMany({
        where: { userId: user.id, status: "complete" },
        orderBy: { createdAt: "desc" },
      });

      const posesSheet = characterSheets.find(s => s.type === "poses");
      const threeDSheet = characterSheets.find(s => s.type === "3d_360");

      if (posesSheet?.compositeUrl) {
        characterSheetUrls.push(posesSheet.compositeUrl);
      }
      if (threeDSheet?.compositeUrl) {
        characterSheetUrls.push(threeDSheet.compositeUrl);
      }

      if (characterSheetUrls.length > 0) {
        console.log(`[process/cut] Character refs: ${characterSheetUrls.length} sheets + ${referencePhotoUrl ? "reference photo" : "no photo"}`);
      }

      // Submit to FAL (returns immediately with job ID)
      const result = await generateVideo({
        model: selectedModel,
        photoUrl,
        voiceUrl: "",
        script: cut.prompt,
        userId: user.id,
        industry: user.industry,
        usePromptEngine: false,
        duration: cut.generateDuration,
        referencePhotoUrl,
        characterSheetUrls,
      });

      // If FAL returned a failed status on submission, fail the video immediately
      if (result.status === "failed") {
        const failMsg = `Cut ${i} generation failed: ${result.error || "FAL submission rejected"}`;
        await markVideoFailed(videoId, failMsg, video.sourceReview);
        return NextResponse.json({
          status: "failed",
          error: failMsg,
        });
      }

      // If FAL returned a sync result (immediate completion), persist to Supabase Storage
      let persistedVideoUrl = result.videoUrl || null;
      let persistedThumbnailUrl = result.thumbnailUrl || null;

      if (result.status === "completed" && result.videoUrl && isStorageConfigured()) {
        try {
          persistedVideoUrl = await downloadAndStore(
            result.videoUrl,
            videoKey(user.id, `${videoId}-cut-${i}`, "mp4"),
            "video/mp4"
          );
        } catch (err) {
          console.error(`[process/cut] Failed to persist cut ${i} video to storage:`, err);
        }
        if (result.thumbnailUrl) {
          try {
            persistedThumbnailUrl = await downloadAndStore(
              result.thumbnailUrl,
              thumbnailKey(user.id, `${videoId}-cut-${i}`, "jpg"),
              "image/jpeg"
            );
          } catch (err) {
            console.error(`[process/cut] Failed to persist cut ${i} thumbnail to storage:`, err);
          }
        }
      }

      // Store job ID in metadata
      if (!meta.cutJobs) meta.cutJobs = {};
      meta.cutJobs[i] = {
        jobId: result.jobId,
        status: result.status,
        videoUrl: persistedVideoUrl,
        thumbnailUrl: persistedThumbnailUrl,
        trimTo: cut.duration,
      };
      await prisma.video.update({
        where: { id: videoId },
        data: { sourceReview: JSON.stringify(meta) },
      });

      const isLastCut = i >= cuts.length - 1;

      return NextResponse.json({
        status: result.status === "completed" ? "cut_done" : "cut_submitted",
        cutIndex: i,
        jobId: result.jobId,
        videoUrl: persistedVideoUrl,
        nextStep: result.status === "completed"
          ? (isLastCut ? "stitch" : "cut")
          : "poll",
        nextCutIndex: isLastCut ? undefined : i + 1,
      });
    }

    // ─── STEP: POLL (check if a cut is done) ──────────────────
    if (step === "poll") {
      const i = cutIndex ?? 0;
      // Re-read sourceReview from DB to get latest metadata (cut step may have updated it)
      const freshForPoll = await prisma.video.findUnique({
        where: { id: videoId },
        select: { sourceReview: true },
      });
      const meta = freshForPoll?.sourceReview ? safeParseJson(freshForPoll.sourceReview as string) : {};
      const cutJob = meta.cutJobs?.[i];

      if (!cutJob?.jobId) {
        return NextResponse.json({ error: `No job for cut ${i}` }, { status: 400 });
      }

      if (cutJob.status === "completed" && cutJob.videoUrl) {
        const cuts = meta.cuts || [];
        const isLastCut = i >= cuts.length - 1;
        return NextResponse.json({
          status: "cut_done",
          cutIndex: i,
          videoUrl: cutJob.videoUrl,
          nextStep: isLastCut ? "stitch" : "cut",
          nextCutIndex: isLastCut ? undefined : i + 1,
        });
      }

      // Poll FAL
      const { falPollOnce } = await import("@/lib/generate");
      const pollResult = await falPollOnce(cutJob.jobId);

      cutJob.status = pollResult.status;

      // ─── Handle FAL job failure gracefully ──────────────────
      if (pollResult.status === "failed") {
        const failMsg = `Cut ${i} generation failed: ${pollResult.error || "FAL reported failure"}`;
        console.error(`[process/poll] ${failMsg}`);

        // Update cut job status in metadata and mark video as failed
        meta.cutJobs[i] = cutJob;
        meta.error = failMsg;
        await prisma.video.update({
          where: { id: videoId },
          data: {
            status: "failed",
            sourceReview: JSON.stringify(meta),
          },
        });

        return NextResponse.json({
          status: "failed",
          error: failMsg,
        });
      }

      // When cut completes, persist video/thumbnail to Supabase Storage (permanent URL)
      if (pollResult.status === "completed" && pollResult.videoUrl) {
        let storedVideoUrl = pollResult.videoUrl;
        let storedThumbnailUrl = pollResult.thumbnailUrl || null;

        if (isStorageConfigured()) {
          try {
            storedVideoUrl = await downloadAndStore(
              pollResult.videoUrl,
              videoKey(user.id, `${videoId}-cut-${i}`, "mp4"),
              "video/mp4"
            );
          } catch (err) {
            console.error(`[process/poll] Failed to persist cut ${i} video to storage:`, err);
          }
          if (pollResult.thumbnailUrl) {
            try {
              storedThumbnailUrl = await downloadAndStore(
                pollResult.thumbnailUrl,
                thumbnailKey(user.id, `${videoId}-cut-${i}`, "jpg"),
                "image/jpeg"
              );
            } catch (err) {
              console.error(`[process/poll] Failed to persist cut ${i} thumbnail to storage:`, err);
            }
          }
        }

        cutJob.videoUrl = storedVideoUrl;
        cutJob.thumbnailUrl = storedThumbnailUrl;
      } else if (pollResult.videoUrl) {
        cutJob.videoUrl = pollResult.videoUrl;
      }

      meta.cutJobs[i] = cutJob;
      await prisma.video.update({
        where: { id: videoId },
        data: { sourceReview: JSON.stringify(meta) },
      });

      if (pollResult.status === "completed") {
        const cuts = meta.cuts || [];
        const isLastCut = i >= cuts.length - 1;
        return NextResponse.json({
          status: "cut_done",
          cutIndex: i,
          videoUrl: cutJob.videoUrl,
          nextStep: isLastCut ? "stitch" : "cut",
          nextCutIndex: isLastCut ? undefined : i + 1,
        });
      }

      return NextResponse.json({
        status: "polling",
        cutIndex: i,
        nextStep: "poll",
        nextCutIndex: i,
        retryAfter: 5,
      });
    }

    // ─── STEP: STITCH ─────────────────────────────────────────
    if (step === "stitch") {
      // Re-read sourceReview from DB to get latest metadata
      const freshForStitch = await prisma.video.findUnique({
        where: { id: videoId },
        select: { sourceReview: true },
      });
      const meta = freshForStitch?.sourceReview ? safeParseJson(freshForStitch.sourceReview as string) : {};
      const cutJobs = meta.cutJobs || {};

      const completedCuts: StitchCut[] = Object.values(cutJobs)
        .filter((j: any) => j.videoUrl)
        .map((j: any) => ({ videoUrl: j.videoUrl, trimTo: j.trimTo }));

      if (completedCuts.length === 0) {
        const failMsg = "No completed cuts to stitch. All video cuts may have failed.";
        await markVideoFailed(videoId, failMsg, video.sourceReview);
        return NextResponse.json({ status: "failed", error: failMsg });
      }

      // Helper: persist a URL to Supabase Storage if it's still a temp URL
      const ensurePermanentUrl = async (url: string, storageKeyPath: string, mime: string): Promise<string> => {
        if (!isStorageConfigured()) return url;
        const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        if (supabaseHost && url.startsWith(supabaseHost)) return url;
        try {
          return await downloadAndStore(url, storageKeyPath, mime);
        } catch (err) {
          console.error(`[process/stitch] Failed to persist ${storageKeyPath}:`, err);
          return url;
        }
      };

      // Get first cut's thumbnail for the final video record
      const firstCutJob: any = Object.values(cutJobs).find((j: any) => j.videoUrl);
      const cutThumbnailUrl = firstCutJob?.thumbnailUrl || null;

      // Single cut — use it directly as the final video
      if (completedCuts.length === 1) {
        const finalUrl = await ensurePermanentUrl(
          completedCuts[0].videoUrl,
          videoKey(user.id, videoId, "mp4"),
          "video/mp4"
        );
        let finalThumb = cutThumbnailUrl;
        if (finalThumb) {
          finalThumb = await ensurePermanentUrl(
            finalThumb,
            thumbnailKey(user.id, videoId, "jpg"),
            "image/jpeg"
          );
        }
        await prisma.video.update({
          where: { id: videoId },
          data: { videoUrl: finalUrl, thumbnailUrl: finalThumb, status: "review" },
        });
        return NextResponse.json({ status: "done", videoUrl: finalUrl });
      }

      // Multiple cuts — stitch via Shotstack
      if (isShotstackConfigured()) {
        try {
          const stitchedUrl = await stitchCuts({
            cuts: completedCuts,
            audioUrl: meta.ttsAudioUrl || undefined,
            aspectRatio: "9:16",
          });

          const storedUrl = await ensurePermanentUrl(
            stitchedUrl,
            videoKey(user.id, videoId, "mp4"),
            "video/mp4"
          );

          let finalThumb = cutThumbnailUrl;
          if (finalThumb) {
            finalThumb = await ensurePermanentUrl(
              finalThumb,
              thumbnailKey(user.id, videoId, "jpg"),
              "image/jpeg"
            );
          }

          await prisma.video.update({
            where: { id: videoId },
            data: { videoUrl: storedUrl, thumbnailUrl: finalThumb, status: "review" },
          });

          return NextResponse.json({ status: "done", videoUrl: storedUrl });
        } catch (err: any) {
          console.error("[process/stitch] Shotstack failed:", err);
          // Fall back to first cut (already a permanent Supabase URL from poll step)
          const fallback = await ensurePermanentUrl(
            completedCuts[0].videoUrl,
            videoKey(user.id, videoId, "mp4"),
            "video/mp4"
          );
          await prisma.video.update({
            where: { id: videoId },
            data: { videoUrl: fallback, thumbnailUrl: cutThumbnailUrl, status: "review" },
          });
          return NextResponse.json({ status: "done", videoUrl: fallback, warning: "Stitch failed, using first cut" });
        }
      } else {
        // No Shotstack — use first cut (already a permanent Supabase URL from poll step)
        const fallback = await ensurePermanentUrl(
          completedCuts[0].videoUrl,
          videoKey(user.id, videoId, "mp4"),
          "video/mp4"
        );
        await prisma.video.update({
          where: { id: videoId },
          data: { videoUrl: fallback, thumbnailUrl: cutThumbnailUrl, status: "review" },
        });
        return NextResponse.json({ status: "done", videoUrl: fallback, warning: "Shotstack not configured" });
      }
    }

    return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 });
  } catch (error: any) {
    console.error("[POST /api/generate/process] Unexpected error:", error);

    // Mark the video as failed so it doesn't stay stuck in "generating"
    if (videoId) {
      try {
        const errMsg = error?.message || "An unexpected error occurred during video generation.";
        await markVideoFailed(videoId, errMsg, videoSourceReview);
      } catch (dbErr) {
        console.error("[POST /api/generate/process] Failed to mark video as failed:", dbErr);
      }
    }

    return NextResponse.json({
      status: "failed",
      error: error?.message || "Internal server error",
    }, { status: 500 });
  }
}
