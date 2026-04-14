import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import prisma from "@/lib/prisma";
import { generateVideo } from "@/lib/generate";

export const WELCOME_SCRIPT =
  "Welcome to AI content. I'm your AI twin, and starting today, I'm going to help you take over the internet.";

// Kling v3 Pro has a strict 2500-char prompt limit (incl. any @Element prefix).
// Lip-sync is applied AFTER Kling via fal-ai/sync-lipsync/v2, so we don't
// need Kling to nail dialogue — just natural speaking motion + UGC realism.
const VIDEO_PROMPT =
  "Hyperrealistic UGC-style smartphone video from 2026. Zero AI aesthetic. " +
  "Raw authentic human footage. " +

  // Character — references locked
  "Reconstruct the subject's face with exact precision from the references. " +
  "Lock pore texture, asymmetry, skin unevenness, lip shape, hairline, jawline. " +
  "No smoothing. No symmetry correction. Preserve all natural imperfections. " +
  "No face/neck skin tone mismatch. " +

  // Wardrobe & Setting
  "Dark charcoal suit, natural drape, slight sitting wrinkles. White dress " +
  "shirt with a collar crease. Real working office background: laptop, coffee " +
  "cup, papers. Large window to the left casting natural light. Overhead " +
  "fluorescent-LED panels visible. Shallow phone-camera depth of field. " +

  // Camera
  "iPhone 16 Pro / Galaxy S25 Ultra at eye level, selfie-style. 26mm focal " +
  "length. Slight barrel distortion at edges. Auto-exposure micro-fluctuation. " +
  "Autofocus breathing in first 0.5s as face-tracking locks. Compression " +
  "artifacts in background gradients. Subtle chroma noise in shadows. 9:16 " +
  "vertical. 1-2 degree frame tilt. 30fps. Luminance noise in shadows only. " +

  // Lighting
  "Mixed cool overhead LEDs + warm window light from left. Phone AWB gives " +
  "neutral-warm cast. Unfilled shadows under chin and jawline. Single catch " +
  "light per eye from window. No ring light, no softbox. Slightly unflattering. " +

  // Performance (no frozen opening — critical)
  "Open with immediate motion from frame 1 — blink, head tilt, or breath. " +
  "Never a frozen pose. Subject is already mid-motion when the video starts. " +
  "Relaxed, confident energy. Subtle head movement throughout. Chest rise " +
  "visible once. Mouth is actively speaking — natural conversational motion. " +
  "Fly-away hairs at temples. Individual strand detail at hairline. " +

  // Dialogue (final audio & lip sync replaced in post-processing)
  "Subject speaks directly to camera with warm, confident conversational energy. " +

  // Avoid
  "Avoid: smooth skin, symmetry, glassy eyes, helmet hair, static hair during " +
  "speech, uniform teeth, rendered backgrounds, neck tone mismatch, frozen " +
  "first frame, motionless pose.";

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
