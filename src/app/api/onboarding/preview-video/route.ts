import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import prisma from "@/lib/prisma";
import { generateVideo } from "@/lib/generate";

const WELCOME_SCRIPT =
  "Welcome to AI content — you can now take over the internet.";

// Kling v3 Pro has a 2500 character prompt limit (~2050 chars below).
const VIDEO_PROMPT =
  "Generate a hyperrealistic UGC-style video that is completely indistinguishable " +
  "from real smartphone footage shot in 2026. Zero AI aesthetic. Zero stylization. " +
  "Raw, authentic human video. " +

  // Character
  "Reconstruct the subject's face with exact precision from the three provided " +
  "references. Lock every feature: pore texture, asymmetry, skin unevenness, " +
  "lip shape, hairline, jawline. No smoothing. No symmetry correction. Preserve " +
  "all natural imperfections. Zero face/neck skin tone mismatch. " +

  // Wardrobe & Setting
  "Dark charcoal suit with natural fabric drape and slight sitting wrinkles. " +
  "White dress shirt with a collar crease. Real working office background — " +
  "laptop, coffee cup, papers. Large window to the left casting natural light. " +
  "Overhead fluorescent-LED office panels visible. Shallow phone-camera depth " +
  "of field, background 4-6 feet behind subject. " +

  // Camera
  "Simulate iPhone 16 Pro or Samsung S25 Ultra at eye level, propped or " +
  "selfie-style. 26mm equivalent focal length. Slight barrel distortion at " +
  "edges. Auto-exposure micro-fluctuation. Autofocus breathing in first " +
  "0.5 seconds as face-tracking locks. Real compression artifacts in background " +
  "gradients. Subtle chroma noise in shadows. 9:16 vertical. 1-2 degree " +
  "frame tilt. 30fps. No film grain — phones suppress it. Luminance noise " +
  "in shadows only. " +

  // Lighting
  "Mixed: cool overhead office LEDs + warm natural window light from left. " +
  "Phone AWB creates a neutral-warm cast. Shadows present under chin and " +
  "jawline — unfilled. Single catch light in each eye from window. " +
  "No ring light. No softbox. Slightly unflattering — this is what makes it real. " +

  // Performance
  "Relaxed, confident. 0.2s natural breath beat before speaking. One blink " +
  "before the line. Subtle head nod micro-movements during speech. Chest " +
  "rise visible once. Tongue tip visible on dental consonants. Natural " +
  "fly-away hairs at temples. Individual strand detail at hairline. " +

  // Dialogue
  `Subject says directly to camera: '${WELCOME_SCRIPT}'. ` +
  "Conversational tone. Confident energy lift on 'take over the internet.' " +
  "Sounds like a belief, not a script. Perfect lip sync. " +

  // Avoid
  "Avoid: smooth skin, perfect symmetry, glassy eyes, helmet hair, static hair " +
  "during speech, white/uniform teeth, rendered-looking background, neck tone " +
  "mismatch, frozen micro-expressions between words.";

/**
 * POST /api/onboarding/preview-video
 *
 * Single 5-second welcome video using Kling v3 with multi-image elements.
 * Passes the user's primary photo as the starting image, plus both
 * character sheets (poses + 360) as reference images for best consistency.
 */
export async function POST(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  try {
    console.log("[welcome-video] Starting generation for user:", user.id);

    // Gather all reference images: primary photo + both character sheets
    const [primaryPhoto, posesSheet, threeSixtySheet] = await Promise.all([
      prisma.photo.findFirst({
        where: { userId: user.id, isPrimary: true },
        select: { url: true },
      }),
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

    // We need at least the primary photo
    const startImageUrl = primaryPhoto?.url;
    if (!startImageUrl) {
      return NextResponse.json(
        { error: "No primary photo available" },
        { status: 400 }
      );
    }

    // Collect character sheet URLs as additional references
    const referenceImageUrls: string[] = [];
    if (posesSheet?.compositeUrl) referenceImageUrls.push(posesSheet.compositeUrl);
    if (threeSixtySheet?.compositeUrl) referenceImageUrls.push(threeSixtySheet.compositeUrl);

    console.log(
      `[welcome-video] Reference images: primary photo + ${referenceImageUrls.length} character sheet(s)`
    );

    // Submit single 8-second video to Kling v3 with elements
    console.log("[welcome-video] Submitting to FAL (Kling v3)...");
    const result = await generateVideo({
      model: "kling_v3",
      photoUrl: startImageUrl,
      voiceUrl: "",
      script: VIDEO_PROMPT,
      userId: user.id,
      duration: 5,
      usePromptEngine: false,
      referenceImageUrls,
    });

    console.log("[welcome-video] FAL job submitted:", result.jobId, result.status);

    // Create a video record to track this
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
        sourceReview: JSON.stringify({ falJobId: result.jobId }),
      },
    });

    return NextResponse.json({
      success: true,
      videoId: video.id,
      falJobId: result.jobId,
      status: result.status,
      videoUrl: result.videoUrl || null,
    });
  } catch (err: any) {
    console.error("[welcome-video] Generation failed:", err);
    return NextResponse.json(
      { error: "Failed to start welcome video generation" },
      { status: 500 }
    );
  }
}
