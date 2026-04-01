import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import prisma from "@/lib/prisma";
import { generateVoiceover } from "@/lib/voice-engine";
import { getOrGenerateStartingFrame } from "@/lib/starting-frame";
import { generateVideo } from "@/lib/generate";

const WELCOME_SCRIPT =
  "Welcome to AI content, time to rule the world.";

const VIDEO_PROMPT =
  "A person looking directly at the camera and speaking confidently. " +
  "Natural head movements and hand gestures as they talk. " +
  "Professional setting, warm lighting. " +
  `AUDIO CONTEXT: The person is speaking these words: '${WELCOME_SCRIPT}'. ` +
  "Their mouth movements should match natural speech.";

/**
 * POST /api/onboarding/welcome-video
 *
 * Simplified welcome video generation — single FAL job, no pipeline.
 * 1. Generate TTS audio
 * 2. Get or generate starting frame
 * 3. Submit one 10s video to Kling 2.6
 * 4. Return jobId for frontend to poll
 */
export async function POST(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const { voiceCloneId } = body as { voiceCloneId?: string };

    console.log("[welcome-video] Starting generation for user:", user.id);

    // Step 1: TTS
    console.log("[welcome-video] Generating TTS...");
    const tts = await generateVoiceover(WELCOME_SCRIPT, voiceCloneId || undefined);
    console.log("[welcome-video] TTS result:", tts.provider, tts.audioUrl ? "has URL" : "no URL");

    // Step 2: Starting frame
    console.log("[welcome-video] Getting starting frame...");
    const startingFrameUrl = await getOrGenerateStartingFrame(user.id);
    console.log("[welcome-video] Starting frame:", startingFrameUrl ? "has URL" : "no URL");

    if (!startingFrameUrl) {
      // Fall back to primary photo
      const primaryPhoto = await prisma.photo.findFirst({
        where: { userId: user.id, isPrimary: true },
        select: { url: true },
      });
      if (!primaryPhoto?.url) {
        return NextResponse.json(
          { error: "No starting frame or photo available" },
          { status: 400 }
        );
      }
      console.log("[welcome-video] Falling back to primary photo");
      return await submitVideoJob(user.id, primaryPhoto.url, tts.audioUrl);
    }

    return await submitVideoJob(user.id, startingFrameUrl, tts.audioUrl);
  } catch (err: any) {
    console.error("[welcome-video] Generation failed:", err);
    return NextResponse.json(
      { error: "Failed to start welcome video generation" },
      { status: 500 }
    );
  }
}

async function submitVideoJob(
  userId: string,
  photoUrl: string,
  ttsAudioUrl: string | null
) {
  // Step 3: Submit single FAL job
  console.log("[welcome-video] Submitting to FAL...");
  const result = await generateVideo({
    model: "kling_2.6",
    photoUrl,
    voiceUrl: ttsAudioUrl || "",
    script: VIDEO_PROMPT,
    userId,
    duration: 10,
    usePromptEngine: false, // Already have a crafted prompt
  });

  console.log("[welcome-video] FAL job submitted:", result.jobId, result.status);

  // Create a video record to track this
  const video = await prisma.video.create({
    data: {
      userId,
      title: "Welcome Video",
      description: "Your AI-generated welcome video",
      script: WELCOME_SCRIPT,
      model: "kling_2.6",
      contentType: "welcome",
      status: result.status === "completed" ? "complete" : "generating",
      duration: 10,
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
}
