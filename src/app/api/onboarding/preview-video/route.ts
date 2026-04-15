import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import prisma from "@/lib/prisma";
import { generateVideo } from "@/lib/generate";
import {
  WELCOME_SCENE,
  generateWelcomeStartingFrame,
} from "@/lib/starting-frame";

const WELCOME_SCRIPT =
  "Welcome to AI content — you can now take over the internet.";

// ---------------------------------------------------------------------------
// Kling video prompt
// ---------------------------------------------------------------------------
//
// Built from the shared WELCOME_SCENE + motion/dialogue instructions. The
// starting frame visually locks the scene (charcoal suit / office / iPhone
// aesthetic); this prompt reinforces it across the 5-second generation.
//
// "@Element1" binds the prompt to the elements[] array (Kling v3 multi-image
// syntax) so the 360 character sheet is used as an identity reference.

const VIDEO_MOTION =
  "CRITICAL: The video must open with immediate motion from frame 1. " +
  "No static opening frame. The subject is already mid-motion when the " +
  "video starts — a slight head movement, a blink, breathing. Never a " +
  "frozen pose. Maintain the exact scene, framing, wardrobe, and lighting " +
  "of the starting frame throughout all 5 seconds — do not change the " +
  "environment, outfit, or camera position. " +
  "Relaxed, confident energy. Subtle head nod micro-movements during " +
  "speech. Chest rise visible once. Tongue tip visible on dental " +
  "consonants. Natural fly-away hairs at temples moving slightly. " +
  // Dialogue
  `Subject says directly to camera: '${WELCOME_SCRIPT}'. ` +
  "Conversational tone. Confident energy lift on 'take over the internet.' " +
  "Sounds like a belief, not a script. Perfect lip sync. " +
  // Identity lock
  "Reconstruct the subject's face with exact precision from the provided " +
  "360 reference sheet. Lock every feature: pore texture, asymmetry, skin " +
  "unevenness, lip shape, hairline, jawline. No smoothing. No symmetry " +
  "correction. Preserve all natural imperfections. Zero face/neck skin " +
  "tone mismatch. " +
  // Avoid
  "Avoid: smooth skin, perfect symmetry, glassy eyes, helmet hair, static " +
  "hair during speech, white/uniform teeth, rendered-looking background, " +
  "neck tone mismatch, frozen micro-expressions between words, static " +
  "opening frame, frozen pose at start of video, motionless first frame, " +
  "scene changes, outfit changes, camera moves.";

const VIDEO_PROMPT = `@Element1 ${WELCOME_SCENE} ${VIDEO_MOTION}`;

/**
 * POST /api/onboarding/preview-video
 *
 * Two-stage welcome video:
 *   1. Generate a STILL starting frame via Nano Banana Pro using the user's
 *      raw photos (identity ground truth) + both character sheets (multi-
 *      angle reinforcement). The frame locks the scene in-office-in-suit
 *      so Kling has nothing to morph through at t=0 (fixes the "two-scene
 *      transition" glitch where Kling dissolves from the raw selfie's
 *      original background into the prompted office).
 *   2. Submit to Kling v3 Pro image-to-video with exactly two inputs:
 *        - start_image_url = generated starting frame
 *        - reference_image_urls = [360 character sheet]
 *
 * On starting-frame failure this endpoint returns 500 — the video will not
 * fall back to the raw primary photo path. The client hits its 3-minute
 * timeout and offers a "Continue to Dashboard" escape.
 */
export async function POST(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  try {
    console.log("[welcome-video] Starting generation for user:", user.id);

    // Fetch both character sheets. Raw photos are fetched inside
    // generateWelcomeStartingFrame itself (it pulls the top 3 directly).
    const [posesSheet, threeSixtySheet] = await Promise.all([
      prisma.characterSheet.findFirst({
        where: { userId: user.id, type: "poses", status: "complete" },
        orderBy: { createdAt: "desc" },
        select: { compositeUrl: true },
      }),
      prisma.characterSheet.findFirst({
        where: { userId: user.id, type: "3d_360", status: "complete" },
        orderBy: { createdAt: "desc" },
        select: { compositeUrl: true },
      }),
    ]);

    if (!posesSheet?.compositeUrl || !threeSixtySheet?.compositeUrl) {
      return NextResponse.json(
        {
          error:
            "Character sheets not ready. Both poses and 360 sheets are required before generating the welcome video.",
        },
        { status: 400 }
      );
    }

    // ── Stage 1: Generate the starting frame ────────────────────────
    // Inputs to Nano Banana Pro: top 3 raw user photos + both character
    // sheets. Output: single still image of the subject in the charcoal
    // suit / office scene, neutral closed-mouth expression.
    console.log("[welcome-video] Generating starting frame via Nano Banana Pro...");
    const startingFrame = await generateWelcomeStartingFrame(user.id, {
      posesSheetUrl: posesSheet.compositeUrl,
      threeDSheetUrl: threeSixtySheet.compositeUrl,
    });

    if (startingFrame.status !== "complete" || !startingFrame.imageUrl) {
      console.error("[welcome-video] Starting frame generation failed");
      return NextResponse.json(
        { error: "Failed to generate starting frame" },
        { status: 500 }
      );
    }

    console.log("[welcome-video] Starting frame ready:", startingFrame.imageUrl);

    // ── Stage 2: Submit to Kling v3 ──────────────────────────────────
    // Exactly two inputs to FAL: the starting frame (as start_image_url
    // and the element's frontal_image_url per Kling v3 element spec) and
    // the 360 character sheet as the sole reference image. The poses
    // sheet is NOT passed — its information is already distilled into the
    // starting frame.
    console.log("[welcome-video] Submitting to FAL (Kling v3)...");
    const result = await generateVideo({
      model: "kling_v3",
      photoUrl: startingFrame.imageUrl,
      voiceUrl: "",
      script: VIDEO_PROMPT,
      userId: user.id,
      duration: 5,
      usePromptEngine: false,
      referenceImageUrls: [threeSixtySheet.compositeUrl],
    });

    console.log("[welcome-video] FAL job submitted:", result.jobId, result.status);

    const video = await prisma.video.create({
      data: {
        userId: user.id,
        title: "Welcome Video",
        description: "Your AI-generated welcome video",
        script: WELCOME_SCRIPT,
        model: "kling_v3",
        contentType: "welcome",
        status: result.status === "completed" ? "complete" : "generating",
        duration: 5,
        videoUrl: result.videoUrl || null,
        thumbnailUrl: result.thumbnailUrl || null,
        sourceReview: JSON.stringify({
          falJobId: result.jobId,
          startingFrameUrl: startingFrame.imageUrl,
          startingFramePhotoId: startingFrame.photoId,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      videoId: video.id,
      falJobId: result.jobId,
      status: result.status,
      videoUrl: result.videoUrl || null,
      startingFrameUrl: startingFrame.imageUrl,
    });
  } catch (err: any) {
    console.error("[welcome-video] Generation failed:", err);
    return NextResponse.json(
      { error: "Failed to start welcome video generation" },
      { status: 500 }
    );
  }
}
