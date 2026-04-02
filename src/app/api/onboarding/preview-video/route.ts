import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import prisma from "@/lib/prisma";
import { generateVideo } from "@/lib/generate";

const WELCOME_SCRIPT = "Welcome to AI content";

const VIDEO_PROMPT =
  "A person filming themselves in a casual selfie-style UGC video, " +
  "looking directly at the camera lens and speaking naturally with a friendly smile. " +
  "Subtle head nods, natural blinks, and relaxed hand gestures. " +
  "Soft natural indoor lighting, shallow depth of field, slightly handheld feel. " +
  "Realistic skin texture, no airbrushed look. " +
  `AUDIO CONTEXT: The person is speaking these words: '${WELCOME_SCRIPT}'. ` +
  "Their mouth movements should match natural speech with clear lip sync.";

/**
 * POST /api/onboarding/preview-video
 *
 * Single 8-second welcome video using Kling v3 with multi-image elements.
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
      duration: 8,
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
        duration: 8,
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
