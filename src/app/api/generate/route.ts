import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { generateRequestSchema } from "@/lib/validations";
import { validateBody } from "@/lib/validate";
import { generateLimiter, RateLimitError } from "@/lib/rate-limit";
import { planComposition } from "@/lib/video-compositor";

/**
 * POST /api/generate — FAST
 *
 * Creates the video record and composition plan, returns immediately.
 * All heavy processing (prompt expansion, TTS, video generation, stitching)
 * happens in /api/generate/process which the frontend calls next.
 *
 * This avoids Netlify's 26s function timeout.
 */
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    try {
      await generateLimiter.check(10, user.id);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Too many requests. Try again later." },
          { status: 429, headers: { "Retry-After": String(err.retryAfter) } }
        );
      }
      // Re-throw unexpected errors so they hit the outer catch
      throw err;
    }

    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const validation = validateBody(generateRequestSchema, body);
    if (validation.error) {
      return NextResponse.json({ error: validation.error, fieldErrors: validation.fieldErrors }, { status: 400 });
    }

    const { videoId, model, script, format, photoId, voiceId } = validation.data;
    const selectedModel = model || "kling_2.6";
    const selectedFormat = format || "talking_head_15";

    // Get or validate existing video
    let video;
    if (videoId) {
      video = await prisma.video.findFirst({ where: { id: videoId, userId: user.id } });
      if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Get photo and voice references (fast DB lookups)
    const photo = photoId
      ? await prisma.photo.findFirst({ where: { id: photoId, userId: user.id } })
      : await prisma.photo.findFirst({ where: { userId: user.id, isPrimary: true } });

    const voice = voiceId
      ? await prisma.voiceSample.findFirst({ where: { id: voiceId, userId: user.id } })
      : await prisma.voiceSample.findFirst({ where: { userId: user.id, isDefault: true } });

    const rawScript = script || video?.script || "";

    // Plan the composition (pure logic, no API calls)
    const plan = planComposition(selectedFormat, rawScript);

    // Create/update video record
    if (!video) {
      video = await prisma.video.create({
        data: {
          userId: user.id,
          title: rawScript.length > 100 ? rawScript.substring(0, 97) + "..." : rawScript || "New Video",
          description: `Format: ${plan.format.name} | ${plan.format.cuts.length} cuts`,
          script: rawScript,
          model: selectedModel,
          contentType: selectedFormat,
          photoId: photo?.id,
          voiceId: voice?.id,
          status: "generating",
          duration: plan.format.totalDuration,
        },
      });
    } else {
      video = await prisma.video.update({
        where: { id: video.id },
        data: {
          status: "generating",
          model: selectedModel,
          contentType: selectedFormat,
          script: rawScript,
          description: `Format: ${plan.format.name} | ${plan.format.cuts.length} cuts`,
          duration: plan.format.totalDuration,
        },
      });
    }

    return NextResponse.json({
      video,
      composition: {
        format: plan.format.name,
        totalCuts: plan.format.cuts.length,
        totalDuration: plan.format.totalDuration,
        status: "queued",
      },
    });
  } catch (error) {
    console.error("[POST /api/generate] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
