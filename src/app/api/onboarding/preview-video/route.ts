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
  // Motion + scene lock
  "CRITICAL: Opens with immediate motion in frame 1 — slight head " +
  "movement, blink, or breath. Never a frozen pose. Maintain the exact " +
  "scene, framing, wardrobe, and lighting of the starting frame across " +
  "all 5 seconds — no scene, outfit, or camera changes. Relaxed, " +
  "confident energy. Subtle head nod during speech. One visible chest rise. " +
  // Dialogue
  `Subject speaks directly to camera: '${WELCOME_SCRIPT}' ` +
  "Conversational, with a confident lift on 'take over the internet.' " +
  "Natural mouth movement — sounds like a belief, not a script. " +
  // Identity lock
  "Face matches the reference smile photo and 360 sheet exactly: pore " +
  "texture, asymmetry, skin unevenness, lip shape, hairline, jawline. " +
  "No smoothing, no symmetry correction. Preserve natural imperfections. " +
  // Teeth
  "TEETH: Match the dentition in the smile reference — slightly off-white " +
  "enamel, natural shape variation, realistic spacing. Tooth count and " +
  "alignment stay constant across every frame. Never morph, shift, " +
  "multiply, or change shape. Not veneer-perfect, not AI-generic. " +
  // Avoid
  "Avoid: smooth skin, glassy eyes, helmet hair, whitening-strip teeth, " +
  "morphing teeth, frozen opening frame, scene or outfit changes, " +
  "camera moves, neck tone mismatch, static hair during speech.";

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
 *   2. Submit to Kling v3 Pro image-to-video:
 *        - start_image_url = generated starting frame (scene + pose lock)
 *        - reference_image_urls:
 *            [0] 360 character sheet (multi-angle identity)
 *            [1] primary smile photo (teeth / dentition anchor, best-effort)
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

    // Client is expected to POST the session's photo URLs explicitly.
    // This scopes the photos used to THIS onboarding run, rather than
    // pulling stale rows from prior sessions via prisma.findFirst.
    //
    // Shape: { photoUrls: string[], voiceCloneId?: string }
    let sessionPhotoUrls: string[] = [];
    try {
      const body = await req.json();
      if (Array.isArray(body?.photoUrls)) {
        sessionPhotoUrls = body.photoUrls.filter(
          (u: unknown): u is string =>
            typeof u === "string" && u.startsWith("http")
        );
      }
    } catch {
      // Body parse failure is non-fatal — we'll fall back to a DB query
      // for the teeth reference below.
    }

    const [posesSheet, threeSixtySheet, fallbackPrimary] = await Promise.all([
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
      // Defensive: if the client didn't send photoUrls, we still want a
      // teeth reference. Pull the most recent primary as a last resort.
      sessionPhotoUrls.length === 0
        ? prisma.photo.findFirst({
            where: {
              userId: user.id,
              isPrimary: true,
              NOT: { filename: { startsWith: "sf--" } },
            },
            orderBy: { createdAt: "desc" },
            select: { url: true },
          })
        : Promise.resolve(null),
    ]);

    // The teeth reference photo. Prefer the first photo the client just
    // uploaded this session; fall back to the DB primary if needed.
    const teethReferenceUrl =
      sessionPhotoUrls[0] || fallbackPrimary?.url || null;

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
    // Inputs to Nano Banana Pro: session photos (up to first 5) + both
    // character sheets. If the client didn't send session photos, the
    // generator falls back to a prisma query for the top 3.
    console.log(
      `[welcome-video] Generating starting frame via Nano Banana Pro (session photos: ${sessionPhotoUrls.length})...`
    );
    const startingFrame = await generateWelcomeStartingFrame(user.id, {
      posesSheetUrl: posesSheet.compositeUrl,
      threeDSheetUrl: threeSixtySheet.compositeUrl,
      userPhotoUrls: sessionPhotoUrls.length > 0 ? sessionPhotoUrls : undefined,
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
    // Inputs to FAL:
    //   - start_image_url / element frontal = starting frame (scene lock)
    //   - reference_image_urls:
    //       [0] 360 character sheet (multi-angle identity)
    //       [1] primary smile photo (teeth / dentition anchor) — best-effort
    // The poses sheet is NOT passed — its information is distilled into
    // the starting frame. If no primary photo exists we still submit
    // with just the 360 sheet rather than failing the whole video.
    const referenceImageUrls: string[] = [threeSixtySheet.compositeUrl];
    if (teethReferenceUrl && !teethReferenceUrl.startsWith("data:")) {
      referenceImageUrls.push(teethReferenceUrl);
      console.log(
        `[welcome-video] Using teeth reference (${sessionPhotoUrls.length > 0 ? "session" : "fallback"}): ${teethReferenceUrl.substring(teethReferenceUrl.lastIndexOf("/") + 1)}`
      );
    } else {
      console.warn(
        "[welcome-video] No teeth reference photo available — teeth may render generically"
      );
    }

    console.log(`[welcome-video] Submitting to FAL (Kling v3) with ${referenceImageUrls.length} reference image(s)...`);
    const result = await generateVideo({
      model: "kling_v3",
      photoUrl: startingFrame.imageUrl,
      voiceUrl: "",
      script: VIDEO_PROMPT,
      userId: user.id,
      duration: 5,
      usePromptEngine: false,
      referenceImageUrls,
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
