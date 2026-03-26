/**
 * Video Stitcher — Shotstack Cloud Video Editing API
 *
 * Takes an array of generated video cut URLs, trims each to its
 * target duration, stitches them into one final video, and optionally
 * adds an audio track (voiceover/music).
 *
 * Replaces FFmpeg — runs in the cloud, works on serverless.
 *
 * API Reference: https://shotstack.io/docs/api/
 * Base URL: https://api.shotstack.io/edit/{env}/render
 * Auth: x-api-key header
 */

// ─── Types ──────────────────────────────────────────────────────

export interface StitchCut {
  videoUrl: string;     // URL of the generated cut video
  trimTo: number;       // seconds to use from this cut
  startFrom?: number;   // seconds to skip from the beginning (default: 0)
}

export interface StitchOptions {
  cuts: StitchCut[];
  audioUrl?: string;      // optional voiceover/music URL
  audioVolume?: number;   // 0-1 (default: 1)
  resolution?: "sd" | "hd" | "1080";  // default: hd (720p)
  aspectRatio?: string;   // default: "9:16" (vertical)
  outputFormat?: "mp4" | "webm";  // default: mp4
}

/** Status values returned by the Shotstack render API */
type ShotstackStatus =
  | "queued"
  | "processing"
  | "rendering"
  | "finalizing"
  | "completed"
  | "done"
  | "failed";

export interface StitchJob {
  id: string;
  status: ShotstackStatus;
  url?: string;         // final video URL when completed
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || "";
// Use sandbox for testing, switch to v1 for production
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || "stage"; // "stage" = sandbox, "v1" = production

// IMPORTANT: The Edit API requires the /edit/ path segment.
// Stage:      https://api.shotstack.io/edit/stage/render
// Production: https://api.shotstack.io/edit/v1/render
const BASE_URL = `https://api.shotstack.io/edit/${SHOTSTACK_ENV}`;

export function isShotstackConfigured(): boolean {
  return !!SHOTSTACK_API_KEY;
}

// ─── Logging ────────────────────────────────────────────────────

const LOG_PREFIX = "[shotstack]";

function log(message: string, data?: unknown) {
  console.log(`${LOG_PREFIX} ${message}`, data !== undefined ? data : "");
}

function logError(message: string, error?: unknown) {
  console.error(`${LOG_PREFIX} ${message}`, error !== undefined ? error : "");
}

// ─── API Helpers ────────────────────────────────────────────────

async function shotstackFetch(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  log(`${options.method || "GET"} ${url}`);

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-api-key": SHOTSTACK_API_KEY,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    logError(`API error (${res.status}): ${body}`);
    throw new Error(`Shotstack API error (${res.status}): ${body}`);
  }

  const json = await res.json();
  return json;
}

// ─── Build Timeline ─────────────────────────────────────────────

function buildTimeline(options: StitchOptions) {
  const { cuts, audioUrl, audioVolume = 1, aspectRatio = "9:16" } = options;

  // Calculate start times for each clip on the timeline
  let currentTime = 0;
  const clips = cuts.map((cut, index) => {
    // Build video asset — only include trim if we need to skip ahead
    const asset: Record<string, unknown> = {
      type: "video",
      src: cut.videoUrl,
    };
    if (cut.startFrom && cut.startFrom > 0) {
      asset.trim = cut.startFrom;
    }

    // Build the clip object
    const clip: Record<string, unknown> = {
      asset,
      start: currentTime,
      length: cut.trimTo,
      fit: "cover",
    };

    // Add cross-dissolve transition between cuts (not on the first)
    if (index > 0) {
      clip.transition = {
        in: "fade",
      };
    }

    currentTime += cut.trimTo;
    log(`Cut ${index}: start=${clip.start}s, length=${cut.trimTo}s, trim=${cut.startFrom || 0}s, src=${cut.videoUrl.substring(0, 80)}...`);
    return clip;
  });

  const totalDuration = currentTime;

  // Build tracks — video clips on track 0
  const tracks: Record<string, unknown>[] = [{ clips }];

  // Audio as a separate track for voiceover/music overlay
  if (audioUrl) {
    tracks.push({
      clips: [{
        asset: {
          type: "audio",
          src: audioUrl,
          volume: audioVolume,
        },
        start: 0,
        length: totalDuration,
      }],
    });
    log(`Audio track: ${audioUrl.substring(0, 80)}..., volume=${audioVolume}, duration=${totalDuration}s`);
  }

  // Resolution mapping — Shotstack expects named resolutions, not pixel counts
  // Valid values: "preview" (512px), "mobile" (640px), "sd" (1024px), "hd" (1280px), "1080" (1920px), "4k" (3840px)
  const resolutionMap: Record<string, string> = {
    sd: "sd",
    hd: "hd",
    "1080": "1080",
  };

  const body = {
    timeline: {
      tracks,
      background: "#000000",
    },
    output: {
      format: options.outputFormat || "mp4",
      resolution: resolutionMap[options.resolution || "hd"] || "hd",
      aspectRatio: aspectRatio,
      fps: 30,
      quality: "high",
    },
  };

  log("Built timeline:", JSON.stringify({
    cutCount: cuts.length,
    totalDuration,
    hasAudio: !!audioUrl,
    resolution: body.output.resolution,
    aspectRatio: body.output.aspectRatio,
    format: body.output.format,
  }));

  return body;
}

// ─── Validation ─────────────────────────────────────────────────

function validateCuts(cuts: StitchCut[]): void {
  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];
    if (!cut.videoUrl) {
      throw new Error(`Cut ${i}: videoUrl is required`);
    }
    if (!cut.videoUrl.startsWith("http://") && !cut.videoUrl.startsWith("https://")) {
      throw new Error(`Cut ${i}: videoUrl must be an HTTP(S) URL, got: ${cut.videoUrl.substring(0, 50)}`);
    }
    if (cut.trimTo <= 0) {
      throw new Error(`Cut ${i}: trimTo must be positive, got: ${cut.trimTo}`);
    }
    if (cut.startFrom !== undefined && cut.startFrom < 0) {
      throw new Error(`Cut ${i}: startFrom cannot be negative, got: ${cut.startFrom}`);
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Submit a stitch job to Shotstack.
 * Returns immediately with a job ID — poll with getStitchStatus().
 */
export async function submitStitch(options: StitchOptions): Promise<StitchJob> {
  if (!isShotstackConfigured()) {
    throw new Error("SHOTSTACK_API_KEY is not set");
  }

  if (options.cuts.length === 0) {
    throw new Error("No cuts provided");
  }

  validateCuts(options.cuts);

  const body = buildTimeline(options);

  log("Submitting render job...");
  const result = await shotstackFetch("/render", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const jobId = result.response?.id;
  if (!jobId) {
    logError("Unexpected response — no job ID:", result);
    throw new Error("Shotstack returned no job ID in response");
  }

  log(`Render job submitted: ${jobId}`);

  return {
    id: jobId,
    status: "queued",
  };
}

/**
 * Check the status of a stitch job.
 */
export async function getStitchStatus(jobId: string): Promise<StitchJob> {
  if (!jobId) {
    throw new Error("jobId is required");
  }

  const result = await shotstackFetch(`/render/${jobId}`);
  const render = result.response;

  if (!render) {
    logError("Unexpected response — no render data:", result);
    throw new Error("Shotstack returned no render data");
  }

  const job: StitchJob = {
    id: render.id,
    status: render.status,
    url: render.url || undefined,
    error: render.error || undefined,
  };

  log(`Job ${jobId}: status=${job.status}${job.url ? `, url=${job.url.substring(0, 80)}` : ""}`);

  return job;
}

/**
 * Poll a stitch job until it completes or fails.
 * Uses progressive backoff: 3s -> 5s -> 8s -> 10s (then stays at 10s).
 */
export async function waitForStitch(
  jobId: string,
  maxWaitMs = 300_000 // 5 minutes
): Promise<StitchJob> {
  const intervals = [3000, 5000, 8000, 10000];
  const start = Date.now();
  let attempt = 0;

  log(`Polling job ${jobId} (timeout: ${maxWaitMs / 1000}s)...`);

  while (Date.now() - start < maxWaitMs) {
    const status = await getStitchStatus(jobId);

    // Shotstack returns "done" or "completed" when the render is finished
    if (status.status === "completed" || status.status === "done") {
      log(`Job ${jobId} completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
      return status;
    }

    if (status.status === "failed") {
      logError(`Job ${jobId} failed after ${((Date.now() - start) / 1000).toFixed(1)}s:`, status.error);
      throw new Error(`Stitch failed: ${status.error || "unknown error"}`);
    }

    const delay = intervals[Math.min(attempt, intervals.length - 1)];
    log(`Job ${jobId}: ${status.status} — retry in ${delay / 1000}s (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, delay));
    attempt++;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  logError(`Job ${jobId} timed out after ${elapsed}s (${attempt} attempts)`);
  throw new Error(`Stitch timed out after ${maxWaitMs / 1000}s`);
}

/**
 * One-shot: submit + wait + return final URL.
 */
export async function stitchCuts(options: StitchOptions): Promise<string> {
  log(`Starting stitch: ${options.cuts.length} cuts, audio=${!!options.audioUrl}`);

  const job = await submitStitch(options);
  const completed = await waitForStitch(job.id);

  if (!completed.url) {
    throw new Error("Stitch completed but no URL returned");
  }

  log(`Stitch complete: ${completed.url}`);
  return completed.url;
}
