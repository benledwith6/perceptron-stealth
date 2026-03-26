import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

const GENERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function safeParseJson(str: string): Record<string, any> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * GET /api/generate/status?videoId=...
 *
 * Returns the current generation status of a video including pipeline progress.
 *
 * Timeout detection: If a video has been in "generating" status for more than
 * 10 minutes (based on updatedAt), this endpoint automatically marks it as
 * "failed" with a timeout error so it doesn't stay stuck forever.
 *
 * Error reporting: When the status is "failed", an `error` field is returned
 * with the reason so the UI can display what went wrong.
 */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    const videoId = req.nextUrl.searchParams.get("videoId");
    if (!videoId) {
      return NextResponse.json(
        { error: "videoId query parameter is required" },
        { status: 400 }
      );
    }

    const video = await prisma.video.findFirst({
      where: { id: videoId, userId: user.id },
      select: {
        id: true,
        status: true,
        videoUrl: true,
        thumbnailUrl: true,
        model: true,
        title: true,
        duration: true,
        updatedAt: true,
        sourceReview: true,
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // ─── Timeout detection ─────────────────────────────────────────
    // If generating for more than 10 minutes, mark as failed automatically
    if (video.status === "generating") {
      const elapsed = Date.now() - new Date(video.updatedAt).getTime();
      if (elapsed > GENERATION_TIMEOUT_MS) {
        const timeoutError = "Generation timed out. Please try again.";
        const meta = video.sourceReview ? safeParseJson(video.sourceReview) : {};
        meta.error = timeoutError;

        await prisma.video.update({
          where: { id: videoId },
          data: {
            status: "failed",
            sourceReview: JSON.stringify(meta),
          },
        });

        const { sourceReview: _sr, ...videoData } = video;
        return NextResponse.json({
          video: { ...videoData, status: "failed", updatedAt: new Date() },
          progress: { step: "failed", currentCut: 0, totalCuts: 0, percent: 0 },
          error: timeoutError,
        });
      }
    }

    // ─── Extract pipeline progress ─────────────────────────────────
    let progress: {
      step: string;
      currentCut: number;
      totalCuts: number;
      percent: number;
    } | null = null;

    if (video.status === "generating" && video.sourceReview) {
      const meta = safeParseJson(video.sourceReview as string);
      const totalCuts = meta.cuts?.length || 0;
      const step: string = meta.pipelineStep || "queued";
      const currentCut: number = meta.pipelineCut ?? 0;

      // Calculate percent based on pipeline stage
      // Stages: expand(5%) -> tts(15%) -> anchor(20%) -> cuts(20-85%) -> stitch(90%) -> store(95%) -> done(100%)
      let percent = 0;
      switch (step) {
        case "queued":
          percent = 0;
          break;
        case "expand":
          percent = 5;
          break;
        case "tts":
          percent = 15;
          break;
        case "anchor":
          percent = 20;
          break;
        case "cut": {
          // Each cut gets an equal share of 20-85% range
          const cutRange = 65; // 85 - 20
          const perCut = totalCuts > 0 ? cutRange / totalCuts : cutRange;
          percent = 20 + Math.round(currentCut * perCut);
          break;
        }
        case "stitch":
          percent = 90;
          break;
        case "store":
          percent = 95;
          break;
        default:
          percent = 0;
      }

      progress = { step, currentCut, totalCuts, percent };
    } else if (video.status === "review" || video.status === "approved" || video.status === "published") {
      progress = { step: "done", currentCut: 0, totalCuts: 0, percent: 100 };
    } else if (video.status === "failed") {
      progress = { step: "failed", currentCut: 0, totalCuts: 0, percent: 0 };
    }

    // ─── Extract error for failed videos ───────────────────────────
    let errorMessage: string | undefined;
    if (video.status === "failed" && video.sourceReview) {
      const meta = safeParseJson(video.sourceReview);
      errorMessage = meta.error || undefined;
    }

    // Return video without sourceReview (internal metadata, not for client)
    const { sourceReview: _sr, ...videoData } = video;

    return NextResponse.json({
      video: videoData,
      progress,
      ...(errorMessage ? { error: errorMessage } : {}),
    });
  } catch (err) {
    console.error("[GET /api/generate/status] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
