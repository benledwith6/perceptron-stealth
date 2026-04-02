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
  thumbnailKey,
} from "@/lib/storage";
import {
  withFalRetry,
  withStorageRetry,
  getNextFallbackModel,
  MODEL_FALLBACK_CHAIN,
} from "@/lib/pipeline/retry";

// ─── Types ──────────────────────────────────────────────────────

export interface GenerateVideoParams {
  model: string;
  photoUrl: string;
  voiceUrl: string;
  script: string;
  userId: string;
  style?: string;
  duration?: number;
  usePromptEngine?: boolean;
  industry?: string;
  /** Item 41: Pass true for onboarding videos to personalize the script with the user's name */
  isOnboarding?: boolean;
  /** Webhook URL for FAL to POST results to when the job completes (server-driven pipeline) */
  webhookUrl?: string;
  /** Video ID for tracking -- passed through to webhook for pipeline continuation */
  videoId?: string;
  /** Cut index for tracking -- passed through to webhook for pipeline continuation */
  cutIndex?: number;
  /** Audio context for the cut — describes what dialogue is being spoken.
   *  When present, appended to the video generation prompt so the model
   *  generates appropriate mouth movements instead of a blank stare.
   *  DATA FLOW GAP #8 FIX */
  audioContext?: string;
  /** Additional reference image URLs for multi-image models (e.g. Kling v3 elements) */
  referenceImageUrls?: string[];
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

/**
 * Clamp a duration to a valid Kling API value.
 * Kling only accepts duration "5" or "10" — nothing else.
 * Rule: if duration <= 7, use 5. If duration > 7, use 10.
 */
function clampToKlingDuration(duration: number | undefined): string {
  const d = duration || 5;
  return d <= 7 ? "5" : "10";
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
  "kling_2.6": {
    falId: "fal-ai/kling-video/v2.6/pro/image-to-video",
    name: "Kling 2.6 Pro",
    description: "Hyper-realistic, best for talking heads and testimonials",
    maxDuration: 10,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => ({
      prompt: p.script,
      image_url: p.photoUrl,
      duration: clampToKlingDuration(p.duration),
      aspect_ratio: "9:16",
    }),
  },

  "kling_v3": {
    falId: "fal-ai/kling-video/v3/pro/image-to-video",
    name: "Kling 3.0 Pro",
    description: "Latest Kling — supports multi-image elements for character consistency",
    maxDuration: 15,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => {
      // Kling v3 Pro accepts durations 3-15, no clamping needed
      const duration = Math.max(3, Math.min(15, p.duration || 5));
      const payload: Record<string, unknown> = {
        prompt: p.script,
        start_image_url: p.photoUrl,
        duration: String(duration),
        aspect_ratio: "9:16",
        generate_audio: false,
      };
      // If extra reference images are provided, pass them as an element
      if (p.referenceImageUrls && p.referenceImageUrls.length > 0) {
        payload.elements = [
          {
            frontal_image_url: p.photoUrl,
            reference_image_urls: p.referenceImageUrls,
          },
        ];
        // Reference the element in the prompt so the model binds to it
        if (!p.script.includes("@Element1")) {
          payload.prompt = `@Element1 ${p.script}`;
        }
      }
      return payload;
    },
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

  // Legacy aliases — route to FAL equivalents
  "seedance_2.0": {
    falId: "fal-ai/kling-video/v2.6/pro/image-to-video",
    name: "Seedance 2.0 → Kling 2.6 Pro",
    description: "Routed to Kling 2.6 Pro via FAL",
    maxDuration: 10,
    supportsImage: true,
    supportsAudio: false,
    buildPayload: (p) => ({
      prompt: p.script,
      image_url: p.photoUrl,
      duration: clampToKlingDuration(p.duration),
      aspect_ratio: "9:16",
    }),
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
  payload: Record<string, unknown>,
  webhookUrl?: string
): Promise<GenerateResult> {
  const apiKey = getFalKey();
  if (!apiKey) return simulateGeneration(modelId);

  // If a webhook URL is provided, include it in the payload so FAL
  // POSTs the result directly to our server when the job completes.
  // This enables server-driven pipeline progression.
  const submitPayload = webhookUrl
    ? { ...payload, webhook_url: webhookUrl }
    : payload;

  try {
    console.log(`[FAL] Full payload for ${modelId}:`, JSON.stringify(submitPayload, null, 2));

    // Wrap the FAL submission in retry logic (2 retries with exponential backoff)
    const { result: response } = await withFalRetry(async () => {
      const res = await fetch(`https://queue.fal.run/${modelId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify(submitPayload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`FAL ${res.status}: ${errText.substring(0, 200)}`);
      }

      return res;
    }, `submit-${modelId}`);

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

    // Store the FULL URLs that FAL gave us -- don't reconstruct them
    const statusUrl = data.status_url;
    const responseUrl = data.response_url;

    console.log(`[FAL] Job submitted: ${data.request_id} (model: ${modelId})`);
    console.log(`[FAL] Status URL: ${statusUrl}`);
    console.log(`[FAL] Response URL: ${responseUrl}`);
    if (webhookUrl) {
      console.log(`[FAL] Webhook URL: ${webhookUrl}`);
    }

    return {
      jobId: `FAL::${statusUrl}::${responseUrl}`,
      status: "processing",
      estimatedTime: 120,
    };
  } catch (err: any) {
    console.error("[FAL] Submit exception (after retries):", err);
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
  if (!apiKey) return { status: "completed", videoUrl: "demo://no-video" };

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

    if (statusData.status === "COMPLETED") {
      // Fetch the actual result using the exact URL FAL gave us
      const resultRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });

      if (!resultRes.ok) {
        return { status: "failed", error: `FAL result fetch failed: ${resultRes.status}` };
      }

      const result = await resultRes.json();
      const videoUrl = result.video?.url || result.output?.url || result.data?.video_url;
      const thumbnailUrl = result.images?.[0]?.url || result.thumbnail?.url || null;

      console.log(`[FAL] Video completed: ${videoUrl ? "has URL" : "no URL"}`);
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
        isOnboarding: params.isOnboarding,
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

  // Step 2.5: DATA FLOW GAP #8 FIX — Inject audio context into the prompt.
  // The Cut type has an `audio` field with dialogue descriptions like
  // "Person says: [script segment]". This was previously decorative and never
  // reached the video model. Now, when audioContext is provided, we append it
  // to the prompt so the video model knows the person IS SPEAKING and generates
  // appropriate mouth movements instead of a blank stare.
  if (params.audioContext && params.audioContext.startsWith("Person says:")) {
    const dialogue = params.audioContext.replace("Person says: ", "").substring(0, 50);
    if (dialogue.trim()) {
      finalScript += ` AUDIO CONTEXT: The person is speaking these words: '${dialogue}'. Their mouth movements should match natural speech.`;
    }
  }

  // Step 3: Build webhook URL if we have the pieces for server-driven pipeline.
  // The webhook URL includes videoId and cutIndex so the webhook handler
  // knows which pipeline step to advance.
  let webhookUrl: string | undefined = params.webhookUrl;
  if (!webhookUrl && params.videoId !== undefined) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    if (appUrl) {
      const base = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
      const qs = new URLSearchParams({
        videoId: params.videoId,
        ...(params.cutIndex !== undefined ? { cutIndex: String(params.cutIndex) } : {}),
      });
      webhookUrl = `${base}/api/generate/webhook?${qs.toString()}`;
    }
  }

  // Step 4: Route to the correct FAL model
  const modelConfig = FAL_MODELS[params.model];
  if (!modelConfig) {
    // Unknown model -- fall back to Kling 2.6
    const fallbackConfig = FAL_MODELS["kling_2.6"];
    const payload = fallbackConfig.buildPayload({ ...params, script: finalScript });
    const result = await falSubmit(fallbackConfig.falId, payload, webhookUrl);
    return { ...result, expandedPrompt };
  }

  const payload = modelConfig.buildPayload({ ...params, script: finalScript });
  console.log(`[generate] Submitting to FAL model: ${modelConfig.falId}`);
  console.log(`[generate] Payload keys: ${Object.keys(payload).join(", ")}`);

  const result = await falSubmit(modelConfig.falId, payload, webhookUrl);
  return { ...result, expandedPrompt };
}

/**
 * Attempt to generate a video cut with model fallback.
 * If the primary model fails on submission, tries the next model in the chain.
 *
 * @returns The result plus the model that was actually used
 */
export async function generateVideoWithFallback(
  params: GenerateVideoParams
): Promise<GenerateResult & { actualModel: string }> {
  let currentModel = params.model;

  // Try the primary model first
  const result = await generateVideo({ ...params, model: currentModel });
  if (result.status !== "failed") {
    return { ...result, actualModel: currentModel };
  }

  // Primary model failed -- try fallbacks
  console.warn(`[generate] Primary model ${currentModel} failed: ${result.error}. Trying fallbacks...`);

  let fallbackModel = getNextFallbackModel(currentModel);
  while (fallbackModel) {
    console.log(`[generate] Trying fallback model: ${fallbackModel}`);
    const fallbackResult = await generateVideo({ ...params, model: fallbackModel });

    if (fallbackResult.status !== "failed") {
      console.log(`[generate] Fallback model ${fallbackModel} succeeded`);
      return { ...fallbackResult, actualModel: fallbackModel };
    }

    console.warn(`[generate] Fallback model ${fallbackModel} also failed: ${fallbackResult.error}`);
    fallbackModel = getNextFallbackModel(fallbackModel);
  }

  // All fallbacks exhausted
  console.error(`[generate] All models in fallback chain failed for this cut`);
  return { ...result, actualModel: currentModel };
}

/**
 * Get the model fallback chain (exported for use in pipeline config/UI).
 */
export function getModelFallbackChain(): string[] {
  return [...MODEL_FALLBACK_CHAIN];
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

        // Upload to S3 if configured (with retry logic)
        if (isStorageConfigured()) {
          try {
            const video = await prisma.video.findUnique({ where: { id: videoId }, select: { userId: true } });
            const userId = video?.userId || "unknown";
            if (result.videoUrl) {
              const { result: storedUrl } = await withStorageRetry(
                () => downloadAndStore(result.videoUrl!, videoKey(userId, videoId, "mp4"), "video/mp4"),
                `poll-video-${videoId}`
              );
              finalVideoUrl = storedUrl;
            }
            if (result.thumbnailUrl) {
              const { result: storedThumb } = await withStorageRetry(
                () => downloadAndStore(result.thumbnailUrl!, thumbnailKey(userId, videoId, "jpg"), "image/jpeg"),
                `poll-thumb-${videoId}`
              );
              finalThumbnailUrl = storedThumb;
            }
          } catch (s3Err) {
            console.error(`[Poll] S3 upload failed for ${videoId} (after retries):`, s3Err);
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

// ─── Utilities ──────────────────────────────────────────────────

function simulateGeneration(model: string): GenerateResult {
  return {
    jobId: `demo-${model}-${Date.now()}`,
    status: "completed",
    videoUrl: "demo://no-video",
    thumbnailUrl: null as any,
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
