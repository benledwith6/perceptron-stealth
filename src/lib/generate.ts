// AI Video Generation — FAL-First Pipeline
//
// ALL video generation routes through FAL (fal.ai).
// One API key, one billing, access to every model.
//
// Supported models via FAL:
//   - Kling 2.6 (image-to-video)
//   - Minimax Video / Hailuo (image-to-video)
//   - LTX Video (image-to-video)
//   - Wan 2.1 (image-to-video)
//   - Luma Dream Machine
//   - Runway Gen-3 Turbo
//
// Adding a new model:
//   1. Add its FAL model ID to FAL_MODELS below
//   2. That's it. FAL handles the rest.

import prisma from "@/lib/prisma";
import { expandPrompt } from "@/lib/prompt-engine";
import {
  isStorageConfigured,
  downloadAndStore,
  videoKey,
} from "@/lib/storage";

// ─── Types ──────────────────────────────────────────────────────

export interface GenerateVideoParams {
  model: string;
  photoUrl: string;          // primary photo (frontal face)
  referenceImageUrls?: string[];  // additional reference images (character sheets, other photos)
  voiceUrl: string;
  script: string;
  userId: string;
  style?: string;
  duration?: number;
  usePromptEngine?: boolean;
  industry?: string;
}

export interface GenerateResult {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  expandedPrompt?: string;
  estimatedTime?: number;
  error?: string;
}

export interface PollResult {
  status: "processing" | "completed" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFalKey(): string | null {
  return process.env.FAL_API_KEY || null;
}

// ─── FAL Model Registry ─────────────────────────────────────────
//
// Every model is just a FAL model ID. The API format is identical
// for all of them — FAL normalizes everything.

interface FalModelConfig {
  falId: string;           // FAL model path
  name: string;
  description: string;
  maxDuration: number;     // max seconds this model supports
  supportsImage: boolean;  // can accept a reference image
  supportsAudio: boolean;  // can accept audio input
  buildPayload: (params: GenerateVideoParams) => Record<string, unknown>;
}

const FAL_MODELS: Record<string, FalModelConfig> = {
  // ─── PRIMARY MODEL: Kling O1 with multi-reference support ───
  "kling_2.6": {
    falId: "fal-ai/kling-video/o1/reference-to-video",
    name: "Kling O1 Reference",
    description: "Multi-reference character consistency — sends all photos + character sheets",
    maxDuration: 10,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => {
      // Build the elements array with character reference images
      // @Element1 in the prompt = the person (all their reference images)
      const elements: Array<{
        frontal_image_url: string;
        reference_image_urls?: string[];
      }> = [];

      if (p.photoUrl) {
        elements.push({
          frontal_image_url: p.photoUrl,
          // Additional reference images: character sheets, other photos
          reference_image_urls: (p.referenceImageUrls || []).filter(Boolean).slice(0, 5), // max ~5 refs + frontal = 6, under 7 limit
        });
      }

      // Prepend @Element1 to the prompt so Kling knows to use the character reference
      const promptWithRef = elements.length > 0
        ? `@Element1 ${(p.script || "").substring(0, 2400)}`
        : (p.script || "").substring(0, 2500);

      return {
        prompt: promptWithRef,
        elements: elements.length > 0 ? elements : undefined,
        duration: (p.duration || 5) >= 8 ? "10" : "5",
        aspect_ratio: "9:16",
      };
    },
  },

  // Fallback: Kling 2.6 single-image (if O1 not available)
  "kling_2.6_single": {
    falId: "fal-ai/kling-video/v2.6/pro/image-to-video",
    name: "Kling 2.6 Pro (Single Image)",
    description: "Hyper-realistic, single reference image only",
    maxDuration: 10,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => ({
      prompt: (p.script || "").substring(0, 2500),
      image_url: p.photoUrl,
      duration: (p.duration || 5) >= 8 ? "10" : "5",
      aspect_ratio: "9:16",
    }),
  },

  "minimax_video": {
    falId: "fal-ai/minimax/video-01/image-to-video",
    name: "Minimax Video 01 (Hailuo)",
    description: "Great motion quality, natural talking heads, good lip sync",
    maxDuration: 6,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => ({
      prompt: p.script,
      image_url: p.photoUrl,
      prompt_optimizer: true,
    }),
  },

  "minimax_hailuo": {
    falId: "fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video",
    name: "Hailuo 2.3 Fast Pro",
    description: "Fastest Hailuo model, great for iteration",
    maxDuration: 6,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => ({
      prompt: p.script,
      image_url: p.photoUrl,
    }),
  },

  "wan_2.1": {
    falId: "fal-ai/wan/v2.1/image-to-video",
    name: "Wan 2.1",
    description: "Strong open-source model, good character consistency",
    maxDuration: 5,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => ({
      prompt: p.script,
      image_url: p.photoUrl,
      num_frames: 81,
      resolution: "480p",
      enable_safety_checker: false,
    }),
  },

  "ltx": {
    falId: "fal-ai/ltx-2.3/image-to-video",
    name: "LTX 2.3",
    description: "Fast generation, good for rapid iteration and testing",
    maxDuration: 5,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => ({
      prompt: p.script,
      image_url: p.photoUrl,
    }),
  },

  "ltx_fast": {
    falId: "fal-ai/ltx-2.3/image-to-video/fast",
    name: "LTX 2.3 Fast",
    description: "Fastest video model, seconds to generate, good for testing",
    maxDuration: 5,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => ({
      prompt: p.script,
      image_url: p.photoUrl,
    }),
  },

  // Legacy aliases — route to Kling O1
  "seedance_2.0": {
    falId: "fal-ai/kling-video/o1/reference-to-video",
    name: "Seedance 2.0 → Kling O1",
    description: "Routed to Kling O1 with multi-reference",
    maxDuration: 10,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => {
      const elements: Array<{ frontal_image_url: string; reference_image_urls?: string[] }> = [];
      if (p.photoUrl) {
        elements.push({
          frontal_image_url: p.photoUrl,
          reference_image_urls: (p.referenceImageUrls || []).filter(Boolean).slice(0, 5),
        });
      }
      return {
        prompt: elements.length > 0 ? `@Element1 ${(p.script || "").substring(0, 2400)}` : (p.script || "").substring(0, 2500),
        elements: elements.length > 0 ? elements : undefined,
        duration: (p.duration || 5) >= 8 ? "10" : "5",
        aspect_ratio: "9:16",
      };
    },
  },

  "sora_2": {
    falId: "fal-ai/minimax/video-01/image-to-video",
    name: "Sora 2 → Minimax Video",
    description: "Routed to Minimax Video via FAL",
    maxDuration: 6,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => ({
      prompt: p.script,
      image_url: p.photoUrl,
      prompt_optimizer: true,
    }),
  },
};

// ─── FAL API ────────────────────────────────────────────────────
//
// FAL returns full URLs for status/result in the initial response.
// We store those URLs directly in the jobId as:
//   "FAL::{status_url}::{response_url}"
// This avoids reconstructing URLs (FAL uses different base paths
// for submit vs status/result).

async function falSubmit(
  modelId: string,
  payload: Record<string, unknown>
): Promise<GenerateResult> {
  const apiKey = getFalKey();
  if (!apiKey) return simulateGeneration(modelId);

  try {
    const response = await fetch(`https://queue.fal.run/${modelId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[FAL] Submit error (${response.status}):`, errText);
      return {
        jobId: `fal-err-${Date.now()}`,
        status: "failed",
        error: `FAL ${response.status}: ${errText.substring(0, 200)}`,
      };
    }

    const data = await response.json();

    // Check for sync result (some models return immediately)
    if (!data.request_id) {
      if (data.video?.url || data.output?.url) {
        return {
          jobId: `fal-sync-${Date.now()}`,
          status: "completed",
          videoUrl: data.video?.url || data.output?.url,
          thumbnailUrl: data.images?.[0]?.url || null,
        };
      }
      return {
        jobId: `fal-err-${Date.now()}`,
        status: "failed",
        error: "No request_id returned from FAL",
      };
    }

    // Store the FULL URLs that FAL gave us — don't reconstruct them
    const statusUrl = data.status_url;
    const responseUrl = data.response_url;

    console.log(`[FAL] Job submitted: ${data.request_id} (model: ${modelId})`);
    console.log(`[FAL] Status URL: ${statusUrl}`);
    console.log(`[FAL] Response URL: ${responseUrl}`);

    return {
      jobId: `FAL::${statusUrl}::${responseUrl}`,
      status: "processing",
      estimatedTime: 120,
    };
  } catch (err: any) {
    console.error("[FAL] Submit exception:", err);
    return {
      jobId: `fal-err-${Date.now()}`,
      status: "failed",
      error: err.message,
    };
  }
}

export async function falPollOnce(compositeJobId: string): Promise<PollResult> {
  return falPoll(compositeJobId);
}

async function falPoll(compositeJobId: string): Promise<PollResult> {
  const apiKey = getFalKey();
  if (!apiKey) return { status: "completed", videoUrl: `/api/demo-video` };

  // Parse "FAL::{status_url}::{response_url}" format
  const parts = compositeJobId.split("::");
  if (parts.length < 3 || parts[0] !== "FAL") {
    return { status: "failed", error: "Invalid FAL job ID format" };
  }

  const statusUrl = parts[1];
  const responseUrl = parts[2];

  try {
    // Check status using the exact URL FAL gave us
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });

    if (!statusRes.ok) {
      return { status: "failed", error: `FAL status check failed: ${statusRes.status}` };
    }

    const statusData = await statusRes.json();
    console.log(`[FAL] Status response:`, JSON.stringify(statusData).substring(0, 300));

    if (statusData.status === "COMPLETED") {
      // Check if the status response itself contains the actual video URL
      // (NOT response_url — that's just the FAL API endpoint)
      const embeddedUrl = statusData.video?.url || statusData.output?.url;
      if (embeddedUrl) {
        console.log(`[FAL] Video URL found in status response: ${embeddedUrl.substring(0, 80)}...`);
        return { status: "completed", videoUrl: embeddedUrl };
      }

      // Fetch the actual result using the response URL FAL gave us
      const resultRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });

      if (!resultRes.ok) {
        const errBody = await resultRes.text().catch(() => "");
        console.error(`[FAL] Response fetch failed (${resultRes.status}): ${errBody.substring(0, 300)}`);
        // 422 = validation error (prompt too long, bad duration, etc.) — will never succeed
        if (resultRes.status === 422) {
          return { status: "failed", error: `FAL validation error: ${errBody.substring(0, 200)}` };
        }
        return { status: "processing" };
      }

      const result = await resultRes.json();
      const videoUrl = result.video?.url || result.output?.url || result.data?.video_url;
      const thumbnailUrl = result.images?.[0]?.url || result.thumbnail?.url || null;

      if (!videoUrl) {
        console.error(`[FAL] Status=COMPLETED but no video URL in response. Keys: ${Object.keys(result).join(", ")}. Treating as still processing.`);
        console.error(`[FAL] Response body sample:`, JSON.stringify(result).substring(0, 500));
        return { status: "processing" };
      }

      console.log(`[FAL] Video completed: ${videoUrl.substring(0, 80)}...`);
      return { status: "completed", videoUrl, thumbnailUrl };
    }

    if (statusData.status === "FAILED") {
      return { status: "failed", error: statusData.error || "FAL generation failed" };
    }

    // IN_QUEUE, IN_PROGRESS, etc.
    return { status: "processing" };
  } catch (err: any) {
    console.error("[FAL] Poll exception:", err);
    return { status: "failed", error: err.message };
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Main entry point for video generation (per-cut).
 * 1. Optionally expands the user's request into a production prompt via Gemini
 * 2. Submits to the correct FAL model
 * 3. Returns generation result (async — poll for completion)
 *
 * Note: TTS audio is generated once at the route level (not per-cut)
 * and synced during the Shotstack stitch step.
 */
export async function generateVideo(params: GenerateVideoParams): Promise<GenerateResult> {
  // Step 1: Prompt engineering (if enabled)
  let finalScript = params.script;
  let expandedPrompt: string | undefined;

  if (params.usePromptEngine !== false) {
    try {
      const expanded = await expandPrompt({
        userRequest: params.script,
        model: params.model,
        userId: params.userId,
        industry: params.industry,
        duration: params.duration,
      });
      finalScript = expanded.expandedPrompt;
      expandedPrompt = expanded.expandedPrompt;
    } catch (err) {
      console.error("[generate] Prompt engine failed, using raw script:", err);
    }
  }

  // Step 2: Voice generation is handled at the route level (once per video,
  // not per cut). The voiceUrl param already contains either the user's voice
  // sample or the TTS-generated audio URL from the route.

  // Step 3: Route to the correct FAL model
  const modelConfig = FAL_MODELS[params.model];
  if (!modelConfig) {
    // Unknown model — fall back to Kling 2.6
    const fallbackConfig = FAL_MODELS["kling_2.6"];
    const payload = fallbackConfig.buildPayload({ ...params, script: finalScript });
    const result = await falSubmit(fallbackConfig.falId, payload);
    return { ...result, expandedPrompt };
  }

  const payload = modelConfig.buildPayload({ ...params, script: finalScript });
  console.log(`[generate] Submitting to FAL model: ${modelConfig.falId}`);
  console.log(`[generate] Payload keys: ${Object.keys(payload).join(", ")}`);

  const result = await falSubmit(modelConfig.falId, payload);
  return { ...result, expandedPrompt };
}

/**
 * Poll a video generation job, updating the DB on completion.
 * Exponential backoff: 10s → 20s → 30s, timeout at 10 minutes.
 */
export async function pollJobUntilDone(
  videoId: string,
  jobId: string,
  _model: string // kept for interface compat, not used (model is in the jobId)
): Promise<void> {
  const TIMEOUT_MS = 10 * 60 * 1000;
  const startTime = Date.now();

  // Skip demo and error jobs
  if (jobId.startsWith("demo-") || jobId.includes("-err-") || jobId.startsWith("fal-sync-")) return;

  let pollCount = 0;

  while (Date.now() - startTime < TIMEOUT_MS) {
    const elapsed = Date.now() - startTime;
    const intervalMs = elapsed < 120_000 ? 10_000 : elapsed < 300_000 ? 20_000 : 30_000;
    await sleep(intervalMs);
    pollCount++;

    try {
      const result = await falPoll(jobId);

      if (result.status === "completed") {
        let finalVideoUrl = result.videoUrl || null;
        let finalThumbnailUrl = result.thumbnailUrl || null;

        // Upload to S3 if configured
        if (isStorageConfigured()) {
          try {
            const video = await prisma.video.findUnique({ where: { id: videoId }, select: { userId: true } });
            const userId = video?.userId || "unknown";
            if (result.videoUrl) {
              finalVideoUrl = await downloadAndStore(result.videoUrl, videoKey(userId, videoId, "mp4"), "video/mp4");
            }
            if (result.thumbnailUrl) {
              finalThumbnailUrl = await downloadAndStore(result.thumbnailUrl, videoKey(userId, `${videoId}-thumb`, "jpg"), "image/jpeg");
            }
          } catch (s3Err) {
            console.error(`[Poll] S3 upload failed for ${videoId}:`, s3Err);
          }
        }

        await prisma.video.update({
          where: { id: videoId },
          data: { status: "review", videoUrl: finalVideoUrl, thumbnailUrl: finalThumbnailUrl },
        });
        console.log(`[Poll] Video ${videoId} completed after ${pollCount} polls (${Math.round(elapsed / 1000)}s)`);
        return;
      }

      if (result.status === "failed") {
        await prisma.video.update({ where: { id: videoId }, data: { status: "failed" } });
        console.error(`[Poll] Video ${videoId} failed: ${result.error}`);
        return;
      }

      console.log(`[Poll] Video ${videoId} still processing (poll ${pollCount}, ${Math.round(elapsed / 1000)}s elapsed)`);
    } catch (err) {
      console.error(`[Poll] Error polling ${videoId}:`, err);
    }
  }

  // Timeout
  await prisma.video.update({ where: { id: videoId }, data: { status: "failed" } });
  console.error(`[Poll] Video ${videoId} timed out after ${Math.round((Date.now() - startTime) / 1000)}s`);
}

// ─── Face Swap (Post-Processing) ────────────────────────────────
//
// After generating a video cut, we face-swap the user's real face onto it.
// This corrects identity drift (wrong eye color, facial structure, etc.)
// Uses: fal-ai/face-swap via FAL

export interface FaceSwapResult {
  jobId: string;
  status: "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

export async function faceSwapSubmit(
  targetVideoUrl: string,
  sourceFaceUrl: string
): Promise<FaceSwapResult> {
  const apiKey = getFalKey();
  if (!apiKey) {
    console.log("[face-swap] No FAL key — skipping face swap");
    return { jobId: "skip", status: "completed", videoUrl: targetVideoUrl };
  }

  try {
    console.log(`[face-swap] Submitting: face=${sourceFaceUrl.substring(0, 60)}... video=${targetVideoUrl.substring(0, 60)}...`);

    // fal-ai/face-swap: source_url = face to extract, target_url = media to swap onto
    const response = await fetch("https://queue.fal.run/fal-ai/face-swap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        source_url: sourceFaceUrl,
        target_url: targetVideoUrl,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[face-swap] Submit error (${response.status}):`, errText.substring(0, 300));
      // Don't fail the pipeline — return original video
      return { jobId: "skip", status: "completed", videoUrl: targetVideoUrl };
    }

    const data = await response.json();

    if (!data.request_id) {
      // Sync result — face-swap may return image.url or video.url
      const videoUrl = data.video?.url || data.image?.url || data.output?.url;
      if (videoUrl) {
        return { jobId: "sync", status: "completed", videoUrl };
      }
      console.error("[face-swap] No request_id:", JSON.stringify(data).substring(0, 300));
      return { jobId: "skip", status: "completed", videoUrl: targetVideoUrl };
    }

    const statusUrl = data.status_url;
    const responseUrl = data.response_url;
    console.log(`[face-swap] Job submitted: ${data.request_id}`);

    return {
      jobId: `SWAP::${statusUrl}::${responseUrl}`,
      status: "processing",
    };
  } catch (err: any) {
    console.error("[face-swap] Submit exception:", err.message);
    return { jobId: "skip", status: "completed", videoUrl: targetVideoUrl };
  }
}

export async function faceSwapPoll(compositeJobId: string): Promise<FaceSwapResult> {
  // Skip/sync jobs are already done
  if (compositeJobId === "skip" || compositeJobId === "sync") {
    return { jobId: compositeJobId, status: "completed" };
  }

  const apiKey = getFalKey();
  if (!apiKey) return { jobId: compositeJobId, status: "failed", error: "No API key" };

  const parts = compositeJobId.split("::");
  if (parts.length < 3 || parts[0] !== "SWAP") {
    return { jobId: compositeJobId, status: "failed", error: "Invalid swap job ID format" };
  }

  const statusUrl = parts[1];
  const responseUrl = parts[2];

  try {
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });

    if (!statusRes.ok) {
      return { jobId: compositeJobId, status: "failed", error: `Status check failed: ${statusRes.status}` };
    }

    const statusData = await statusRes.json();
    console.log(`[face-swap] Poll status: ${statusData.status}`);

    if (statusData.status === "COMPLETED") {
      // Check embedded result — face-swap returns image.url for images, video.url for videos
      const embeddedUrl = statusData.video?.url || statusData.image?.url || statusData.output?.url;
      if (embeddedUrl) {
        return { jobId: compositeJobId, status: "completed", videoUrl: embeddedUrl };
      }

      // Fetch full result
      const resultRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });

      if (!resultRes.ok) {
        console.error(`[face-swap] Response fetch failed: ${resultRes.status}`);
        return { jobId: compositeJobId, status: "failed", error: `Response fetch failed: ${resultRes.status}` };
      }

      const result = await resultRes.json();
      const videoUrl = result.video?.url || result.image?.url || result.output?.url || result.video_url;

      if (!videoUrl) {
        console.error("[face-swap] Completed but no video URL. Keys:", Object.keys(result).join(", "));
        return { jobId: compositeJobId, status: "failed", error: "No video URL in result" };
      }

      console.log(`[face-swap] Completed: ${videoUrl.substring(0, 80)}...`);
      return { jobId: compositeJobId, status: "completed", videoUrl };
    }

    if (statusData.status === "FAILED") {
      return { jobId: compositeJobId, status: "failed", error: statusData.error || "Face swap failed" };
    }

    return { jobId: compositeJobId, status: "processing" };
  } catch (err: any) {
    console.error("[face-swap] Poll exception:", err.message);
    return { jobId: compositeJobId, status: "failed", error: err.message };
  }
}

// ─── Utilities ──────────────────────────────────────────────────

function simulateGeneration(model: string): GenerateResult {
  return {
    jobId: `demo-${model}-${Date.now()}`,
    status: "completed",
    videoUrl: `/api/demo-video?model=${model}`,
    thumbnailUrl: `/api/demo-thumbnail?model=${model}`,
    estimatedTime: 0,
  };
}

export function getAvailableModels(): { id: string; name: string; description: string; available: boolean }[] {
  const hasFal = !!getFalKey();
  return Object.entries(FAL_MODELS).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
    available: hasFal,
  }));
}

export function getModelInfo(model: string) {
  const config = FAL_MODELS[model];
  if (!config) return { name: model, description: "Unknown model", features: [], bestFor: "", avgTime: "" };
  return {
    name: config.name,
    description: config.description,
    features: [
      config.supportsImage ? "Image-to-video" : "Text-to-video",
      `Max ${config.maxDuration}s`,
    ],
    bestFor: config.description,
    avgTime: "~1-3 minutes",
  };
}
