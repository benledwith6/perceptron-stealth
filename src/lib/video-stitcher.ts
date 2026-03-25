/**
 * Video Stitcher — Shotstack Cloud Video Editing API
 *
 * Takes an array of generated video cut URLs, trims each to its
 * target duration, stitches them into one final video, and optionally
 * adds an audio track (voiceover/music).
 *
 * Replaces FFmpeg — runs in the cloud, works on serverless.
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

export interface StitchJob {
  id: string;
  status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
  url?: string;         // final video URL when done
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || "";
// Use sandbox for testing, switch to v1 for production
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || "stage"; // "stage" = sandbox, "v1" = production
const BASE_URL = `https://api.shotstack.io/${SHOTSTACK_ENV}`;

export function isShotstackConfigured(): boolean {
  return !!SHOTSTACK_API_KEY;
}

// ─── API Helpers ────────────────────────────────────────────────

async function shotstackFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": SHOTSTACK_API_KEY,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shotstack API error (${res.status}): ${body}`);
  }

  return res.json();
}

// ─── Build Timeline ─────────────────────────────────────────────

function buildTimeline(options: StitchOptions) {
  const { cuts, audioUrl, audioVolume = 1, aspectRatio = "9:16" } = options;

  // Calculate start times for each clip on the timeline
  let currentTime = 0;
  const clips = cuts.map((cut) => {
    const clip = {
      asset: {
        type: "video",
        src: cut.videoUrl,
        trim: cut.startFrom || 0,
      },
      start: currentTime,
      length: cut.trimTo,
      // Fit to frame without stretching
      fit: "cover",
      // Slight cross-dissolve between cuts for polish
      transition: currentTime > 0 ? {
        in: "fade",
        out: "fade",
      } : undefined,
    };
    currentTime += cut.trimTo;
    return clip;
  });

  // Build tracks — video on track 0, audio on track 1
  const tracks: any[] = [{ clips }];

  if (audioUrl) {
    tracks.push({
      clips: [{
        asset: {
          type: "audio",
          src: audioUrl,
          volume: audioVolume,
        },
        start: 0,
        length: currentTime, // match total video duration
      }],
    });
  }

  // Shotstack expects: "preview", "mobile", "sd", "hd", "1080", "4k"
  const resolutionMap: Record<string, string> = {
    sd: "sd",
    hd: "hd",
    "1080": "1080",
  };

  return {
    timeline: {
      tracks,
      background: "#000000",
    },
    output: {
      format: options.outputFormat || "mp4",
      resolution: resolutionMap[options.resolution || "hd"] || "hd",
      aspectRatio: aspectRatio,
      // Optimize for social media
      fps: 30,
      quality: "high",
    },
  };
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

  const body = buildTimeline(options);

  const result = await shotstackFetch("/render", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    id: result.response.id,
    status: "queued",
  };
}

/**
 * Check the status of a stitch job.
 */
export async function getStitchStatus(jobId: string): Promise<StitchJob> {
  const result = await shotstackFetch(`/render/${jobId}`);
  const render = result.response;

  return {
    id: render.id,
    status: render.status,
    url: render.url || undefined,
    error: render.error || undefined,
  };
}

/**
 * Poll a stitch job until it completes.
 * Uses exponential backoff: 3s → 5s → 8s → 10s
 */
export async function waitForStitch(
  jobId: string,
  maxWaitMs = 300_000 // 5 minutes
): Promise<StitchJob> {
  const intervals = [3000, 5000, 8000, 10000];
  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < maxWaitMs) {
    const status = await getStitchStatus(jobId);

    if (status.status === "done") return status;
    if (status.status === "failed") {
      throw new Error(`Stitch failed: ${status.error || "unknown error"}`);
    }

    const delay = intervals[Math.min(attempt, intervals.length - 1)];
    await new Promise((r) => setTimeout(r, delay));
    attempt++;
  }

  throw new Error(`Stitch timed out after ${maxWaitMs / 1000}s`);
}

/**
 * One-shot: submit + wait + return final URL.
 */
export async function stitchCuts(options: StitchOptions): Promise<string> {
  const job = await submitStitch(options);
  const completed = await waitForStitch(job.id);

  if (!completed.url) {
    throw new Error("Stitch completed but no URL returned");
  }

  return completed.url;
}
