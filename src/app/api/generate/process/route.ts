import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { generateVideo, pollJobUntilDone, faceSwapSubmit, faceSwapPoll } from "@/lib/generate";
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
 *   step=tts     → Generate TTS audio from DIALOGUE only (~5-10s)
 *   step=cut&i=0 → Generate video cut #i via FAL (submits async, ~1s)
 *   step=poll&i=0 → Poll FAL for cut #i → face swap → return done
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

      // Extract DIALOGUE ONLY from each cut for TTS (not production prompts)
      const dialogueScripts = expandedPlan.format.cuts
        .map(c => c.dialogueScript)
        .filter(Boolean)
        .join("\n\n");

      // Store cut data as JSON in sourceReview for later steps
      const cutData = expandedPlan.format.cuts.map(c => ({
        index: c.index,
        type: c.type,
        duration: c.duration,
        generateDuration: c.generateDuration,
        prompt: c.prompt,
        dialogueScript: c.dialogueScript || null,
      }));

      await prisma.video.update({
        where: { id: videoId },
        data: {
          script: allPrompts.substring(0, 5000),
          sourceReview: JSON.stringify({
            cuts: cutData,
            format: selectedFormat,
            // Store the original user script + extracted dialogue for TTS
            originalScript: rawScript,
            ttsDialogue: dialogueScripts || null,
          }),
        },
      });

      console.log(`[process/expand] ${cutData.length} cuts expanded. Dialogue for TTS: ${dialogueScripts ? dialogueScripts.length + ' chars' : 'none (will use original script)'}`);

      return NextResponse.json({
        status: "expanded",
        totalCuts: cutData.length,
        nextStep: "tts",
      });
    }

    // ─── STEP: TTS ────────────────────────────────────────────
    if (step === "tts") {
      let ttsAudioUrl: string | null = null;

      const meta = video.sourceReview ? JSON.parse(video.sourceReview as string) : {};

      // FIX: Use extracted dialogue for TTS, NOT the full production prompts
      // Priority: extracted dialogue → original user script → skip
      const ttsText = meta.ttsDialogue || meta.originalScript || "";

      if (ttsText && ttsText.length > 10) {
        console.log(`[process/tts] Generating voiceover from dialogue (${ttsText.length} chars), NOT production prompts`);
        try {
          const ttsResult = await generateVoiceover(ttsText);
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
          console.log(`[process/tts] TTS result: provider=${ttsResult.provider}, hasAudio=${!!ttsAudioUrl}`);
        } catch (err) {
          console.error("[process/tts] TTS failed:", err);
        }
      } else {
        console.log("[process/tts] No dialogue text available for TTS — skipping");
      }

      // Store TTS URL in metadata
      meta.ttsAudioUrl = ttsAudioUrl;
      await prisma.video.update({
        where: { id: videoId },
        data: { sourceReview: JSON.stringify(meta) },
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

      // Validate cutIndex bounds
      if (!Number.isInteger(i) || i < 0) {
        return NextResponse.json({ error: "cutIndex must be a non-negative integer" }, { status: 400 });
      }

      const meta = video.sourceReview ? JSON.parse(video.sourceReview as string) : {};
      const cuts = meta.cuts || [];

      if (i >= cuts.length) {
        return NextResponse.json({ error: `cutIndex ${i} is out of bounds (${cuts.length} cuts available)` }, { status: 400 });
      }

      const cut = cuts[i];

      if (!cut) {
        return NextResponse.json({ error: `Cut ${i} not found` }, { status: 400 });
      }

      // Get user's primary photo (frontal face — best headshot)
      const photo = video.photoId
        ? await prisma.photo.findFirst({ where: { id: video.photoId } })
        : await prisma.photo.findFirst({ where: { userId: user.id, isPrimary: true } });

      const photoUrl = photo?.url || "";

      // Gather reference images for Kling O1 (FAL enforces max 3 reference_image_urls)
      // Priority: starting frame, poses character sheet, 3D/360 character sheet
      const referenceImageUrls: string[] = [];

      // 1. Starting frame — the anchor image for character consistency across cuts
      const startingFrame = await prisma.photo.findFirst({
        where: {
          userId: user.id,
          filename: { startsWith: "starting-frame" },
          url: { not: { startsWith: "/uploads/" } },
        },
        orderBy: { createdAt: "desc" },
      });

      if (startingFrame?.url && !startingFrame.url.startsWith("data:")) {
        referenceImageUrls.push(startingFrame.url);
      }

      // 2. Poses character sheet — multiple poses for the AI to reference
      const posesSheet = await prisma.characterSheet.findFirst({
        where: { userId: user.id, status: "complete", type: "poses" },
        orderBy: { createdAt: "desc" },
      });

      if (posesSheet?.compositeUrl && !posesSheet.compositeUrl.startsWith("data:")) {
        referenceImageUrls.push(posesSheet.compositeUrl);
      }

      // 3. 3D/360° character sheet — rotation angles for depth understanding
      const threeDSheet = await prisma.characterSheet.findFirst({
        where: { userId: user.id, status: "complete", type: "3d_360" },
        orderBy: { createdAt: "desc" },
      });

      if (threeDSheet?.compositeUrl && !threeDSheet.compositeUrl.startsWith("data:")) {
        referenceImageUrls.push(threeDSheet.compositeUrl);
      }

      console.log(`[process/cut] Cut ${i} — frontal photo: ${photoUrl.substring(0, 60)}...`);
      console.log(`[process/cut] Cut ${i} — ${referenceImageUrls.length} reference images (max 3): ${referenceImageUrls.map(u => u.substring(0, 50)).join(", ")}`);

      // Submit to FAL with reference images (capped at 3 per FAL limit)
      const result = await generateVideo({
        model: selectedModel,
        photoUrl,
        referenceImageUrls,
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
        // Face swap fields (populated later)
        swapJobId: null,
        swapStatus: null,
        swappedVideoUrl: null,
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

    // ─── STEP: POLL (check if cut is done → face swap → done) ─
    if (step === "poll") {
      const i = cutIndex ?? 0;

      // Validate cutIndex bounds
      if (!Number.isInteger(i) || i < 0) {
        return NextResponse.json({ error: "cutIndex must be a non-negative integer" }, { status: 400 });
      }

      const meta = video.sourceReview ? JSON.parse(video.sourceReview as string) : {};
      const cutJob = meta.cutJobs?.[i];

      if (!cutJob?.jobId) {
        return NextResponse.json({ error: `No job for cut ${i}` }, { status: 400 });
      }

      // ── Phase 1: Video generation polling ──
      if (cutJob.status !== "completed" || !cutJob.videoUrl) {
        // Still waiting for Kling to finish
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

        if (pollResult.status === "failed") {
          console.error(`[process/poll] Cut ${i} FAILED: ${pollResult.error}`);
          return NextResponse.json({
            status: "cut_failed",
            cutIndex: i,
            error: pollResult.error || "Video generation failed",
          });
        }

        if (pollResult.status !== "completed" || !pollResult.videoUrl) {
          return NextResponse.json({
            status: "polling",
            cutIndex: i,
            nextStep: "poll",
            nextCutIndex: i,
            retryAfter: 5,
          });
        }

        // Video just completed! Fall through to face swap submission below
        console.log(`[process/poll] Cut ${i} VIDEO COMPLETED — ${pollResult.videoUrl.substring(0, 80)}...`);
      }

      // ── Phase 2: Face swap ──
      // If video is done but face swap hasn't started, submit it
      if (!cutJob.swapJobId) {
        // Get user's primary photo for face swap source
        const facePhoto = await prisma.photo.findFirst({
          where: { userId: user.id, isPrimary: true },
        });

        if (facePhoto?.url && cutJob.videoUrl) {
          console.log(`[process/poll] Cut ${i} — submitting face swap...`);
          const swapResult = await faceSwapSubmit(cutJob.videoUrl, facePhoto.url);

          cutJob.swapJobId = swapResult.jobId;
          cutJob.swapStatus = swapResult.status;
          if (swapResult.videoUrl) cutJob.swappedVideoUrl = swapResult.videoUrl;

          meta.cutJobs[i] = cutJob;
          await prisma.video.update({
            where: { id: videoId },
            data: { sourceReview: JSON.stringify(meta) },
          });

          // If face swap completed instantly (skip/sync), mark as done
          if (swapResult.status === "completed") {
            const finalUrl = swapResult.videoUrl || cutJob.videoUrl;
            cutJob.swappedVideoUrl = finalUrl;
            meta.cutJobs[i] = cutJob;
            await prisma.video.update({
              where: { id: videoId },
              data: { sourceReview: JSON.stringify(meta) },
            });

            const cuts = meta.cuts || [];
            const isLastCut = i >= cuts.length - 1;
            console.log(`[process/poll] Cut ${i} FACE SWAP DONE (instant) — ${finalUrl.substring(0, 80)}...`);
            return NextResponse.json({
              status: "cut_done",
              cutIndex: i,
              videoUrl: finalUrl,
              nextStep: isLastCut ? "stitch" : "cut",
              nextCutIndex: isLastCut ? undefined : i + 1,
            });
          }

          // Face swap submitted async — tell frontend to keep polling
          return NextResponse.json({
            status: "polling",
            cutIndex: i,
            nextStep: "poll",
            nextCutIndex: i,
            retryAfter: 5,
            phase: "face_swap",
          });
        } else {
          // No face photo or no video URL — skip face swap
          console.log(`[process/poll] Cut ${i} — skipping face swap (no face photo or video URL)`);
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
      }

      // ── Phase 3: Poll face swap ──
      if (cutJob.swapJobId && cutJob.swapStatus !== "completed") {
        const swapResult = await faceSwapPoll(cutJob.swapJobId);

        cutJob.swapStatus = swapResult.status;
        if (swapResult.videoUrl) cutJob.swappedVideoUrl = swapResult.videoUrl;
        meta.cutJobs[i] = cutJob;
        await prisma.video.update({
          where: { id: videoId },
          data: { sourceReview: JSON.stringify(meta) },
        });

        if (swapResult.status === "completed") {
          const finalUrl = swapResult.videoUrl || cutJob.videoUrl;
          const cuts = meta.cuts || [];
          const isLastCut = i >= cuts.length - 1;
          console.log(`[process/poll] Cut ${i} FACE SWAP COMPLETED — ${finalUrl.substring(0, 80)}...`);
          return NextResponse.json({
            status: "cut_done",
            cutIndex: i,
            videoUrl: finalUrl,
            nextStep: isLastCut ? "stitch" : "cut",
            nextCutIndex: isLastCut ? undefined : i + 1,
          });
        }

        if (swapResult.status === "failed") {
          // Face swap failed — use original video (don't fail the pipeline)
          console.error(`[process/poll] Cut ${i} face swap FAILED: ${swapResult.error} — using original video`);
          const cuts = meta.cuts || [];
          const isLastCut = i >= cuts.length - 1;
          return NextResponse.json({
            status: "cut_done",
            cutIndex: i,
            videoUrl: cutJob.videoUrl, // Fall back to un-swapped video
            nextStep: isLastCut ? "stitch" : "cut",
            nextCutIndex: isLastCut ? undefined : i + 1,
          });
        }

        // Still processing face swap
        return NextResponse.json({
          status: "polling",
          cutIndex: i,
          nextStep: "poll",
          nextCutIndex: i,
          retryAfter: 5,
          phase: "face_swap",
        });
      }

      // Face swap already completed — return done
      const finalUrl = cutJob.swappedVideoUrl || cutJob.videoUrl;
      const cuts = meta.cuts || [];
      const isLastCut = i >= cuts.length - 1;
      return NextResponse.json({
        status: "cut_done",
        cutIndex: i,
        videoUrl: finalUrl,
        nextStep: isLastCut ? "stitch" : "cut",
        nextCutIndex: isLastCut ? undefined : i + 1,
      });
    }

    // ─── STEP: STITCH ─────────────────────────────────────────
    if (step === "stitch") {
      const meta = video.sourceReview ? JSON.parse(video.sourceReview as string) : {};
      const cutJobs = meta.cutJobs || {};

      console.log(`[process/stitch] cutJobs:`, JSON.stringify(cutJobs, null, 2));

      // Use face-swapped video URLs when available, fall back to originals
      const completedCuts: StitchCut[] = Object.values(cutJobs)
        .filter((j: any) => j.swappedVideoUrl || j.videoUrl)
        .map((j: any) => ({
          videoUrl: j.swappedVideoUrl || j.videoUrl,
          trimTo: j.trimTo,
        }));

      console.log(`[process/stitch] ${completedCuts.length} cuts ready for stitch out of ${Object.keys(cutJobs).length} total`);

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
