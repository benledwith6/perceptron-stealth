import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { generateVideo, pollJobUntilDone } from "@/lib/generate";
import { expandCutPrompts, planComposition } from "@/lib/video-compositor";
import { generateStartingFrame } from "@/lib/starting-frame";
import { stitchCuts, isShotstackConfigured, StitchCut } from "@/lib/video-stitcher";
import { downloadAndStore, videoKey, audioKey, isStorageConfigured } from "@/lib/storage";
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
 */
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { videoId, step, cutIndex } = body as { videoId: string; step: string; cutIndex?: number };

    if (!videoId || !step) {
      return NextResponse.json({ error: "videoId and step are required" }, { status: 400 });
    }

    const video = await prisma.video.findFirst({ where: { id: videoId, userId: user.id } });
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    const selectedModel = video.model || "kling_2.6";
    const selectedFormat = video.contentType || "talking_head_15";
    const rawScript = video.script || "";

    // ─── STEP: EXPAND ─────────────────────────────────────────
    if (step === "expand") {
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
          sourceReview: JSON.stringify({ cuts: cutData, format: selectedFormat }),
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
              } catch {
                ttsAudioUrl = ttsResult.audioUrl;
              }
            } else {
              ttsAudioUrl = ttsResult.audioUrl;
            }
          }
        } catch (err) {
          console.error("[process/tts] TTS failed:", err);
        }
      }

      // Store TTS URL in metadata
      const existing = video.sourceReview ? JSON.parse(video.sourceReview as string) : {};
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
      const meta = video.sourceReview ? JSON.parse(video.sourceReview as string) : {};
      const cuts = meta.cuts || [];
      const cut = cuts[i];

      if (!cut) {
        return NextResponse.json({ error: `Cut ${i} not found` }, { status: 400 });
      }

      // Get photo for starting frame
      const photo = video.photoId
        ? await prisma.photo.findFirst({ where: { id: video.photoId } })
        : await prisma.photo.findFirst({ where: { userId: user.id, isPrimary: true } });

      const photoUrl = photo?.url || "";

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
      });

      // Store job ID in metadata
      if (!meta.cutJobs) meta.cutJobs = {};
      meta.cutJobs[i] = {
        jobId: result.jobId,
        status: result.status,
        videoUrl: result.videoUrl || null,
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
        videoUrl: result.videoUrl || null,
        nextStep: result.status === "completed"
          ? (isLastCut ? "stitch" : "cut")
          : "poll",
        nextCutIndex: isLastCut ? undefined : i + 1,
      });
    }

    // ─── STEP: POLL (check if a cut is done) ──────────────────
    if (step === "poll") {
      const i = cutIndex ?? 0;
      const meta = video.sourceReview ? JSON.parse(video.sourceReview as string) : {};
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

      console.log(`[process/poll] Cut ${i} — FAL status: ${pollResult.status}, hasVideoUrl: ${!!pollResult.videoUrl}`);

      cutJob.status = pollResult.status;
      if (pollResult.videoUrl) cutJob.videoUrl = pollResult.videoUrl;
      meta.cutJobs[i] = cutJob;
      await prisma.video.update({
        where: { id: videoId },
        data: { sourceReview: JSON.stringify(meta) },
      });

      if (pollResult.status === "completed") {
        const cuts = meta.cuts || [];
        const isLastCut = i >= cuts.length - 1;
        console.log(`[process/poll] Cut ${i} COMPLETED — videoUrl: ${pollResult.videoUrl?.substring(0, 80)}...`);
        return NextResponse.json({
          status: "cut_done",
          cutIndex: i,
          videoUrl: pollResult.videoUrl,
          nextStep: isLastCut ? "stitch" : "cut",
          nextCutIndex: isLastCut ? undefined : i + 1,
        });
      }

      if (pollResult.status === "failed") {
        console.error(`[process/poll] Cut ${i} FAILED: ${pollResult.error}`);
        return NextResponse.json({
          status: "cut_failed",
          cutIndex: i,
          error: pollResult.error || "Video generation failed",
        });
      }

      console.log(`[process/poll] Cut ${i} still processing — returning "polling"`);
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
      const meta = video.sourceReview ? JSON.parse(video.sourceReview as string) : {};
      const cutJobs = meta.cutJobs || {};

      console.log(`[process/stitch] cutJobs:`, JSON.stringify(cutJobs, null, 2));

      const completedCuts: StitchCut[] = Object.values(cutJobs)
        .filter((j: any) => j.videoUrl)
        .map((j: any) => ({ videoUrl: j.videoUrl, trimTo: j.trimTo }));

      console.log(`[process/stitch] ${completedCuts.length} cuts with videoUrls out of ${Object.keys(cutJobs).length} total`);

      if (completedCuts.length === 0) {
        return NextResponse.json({ error: "No completed cuts to stitch" }, { status: 400 });
      }

      // Single cut — just store it directly
      if (completedCuts.length === 1) {
        let finalUrl = completedCuts[0].videoUrl;
        if (isStorageConfigured()) {
          try {
            finalUrl = await downloadAndStore(finalUrl, videoKey(user.id, videoId, "mp4"), "video/mp4");
          } catch { /* use original URL */ }
        }
        await prisma.video.update({
          where: { id: videoId },
          data: { videoUrl: finalUrl, status: "review" },
        });
        return NextResponse.json({ status: "done", videoUrl: finalUrl });
      }

      // Multiple cuts — stitch via Shotstack
      if (isShotstackConfigured()) {
        try {
          const finalUrl = await stitchCuts({
            cuts: completedCuts,
            audioUrl: meta.ttsAudioUrl || undefined,
            aspectRatio: "9:16",
          });

          let storedUrl = finalUrl;
          if (isStorageConfigured()) {
            try {
              storedUrl = await downloadAndStore(finalUrl, videoKey(user.id, videoId, "mp4"), "video/mp4");
            } catch { /* use Shotstack URL */ }
          }

          await prisma.video.update({
            where: { id: videoId },
            data: { videoUrl: storedUrl, status: "review" },
          });

          return NextResponse.json({ status: "done", videoUrl: storedUrl });
        } catch (err: any) {
          console.error("[process/stitch] Shotstack failed:", err);
          // Fall back to first cut
          const fallback = completedCuts[0].videoUrl;
          await prisma.video.update({
            where: { id: videoId },
            data: { videoUrl: fallback, status: "review" },
          });
          return NextResponse.json({ status: "done", videoUrl: fallback, warning: "Stitch failed, using first cut" });
        }
      } else {
        // No Shotstack — use first cut
        const fallback = completedCuts[0].videoUrl;
        await prisma.video.update({
          where: { id: videoId },
          data: { videoUrl: fallback, status: "review" },
        });
        return NextResponse.json({ status: "done", videoUrl: fallback, warning: "Shotstack not configured" });
      }
    }

    return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/generate/process] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
