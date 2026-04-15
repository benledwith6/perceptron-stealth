/**
 * Video Utilities — server-side ffmpeg operations
 *
 * These helpers are used by the welcome-video pipeline to clean up Kling's
 * output before passing it to the lipsync stage. Specifically, Kling v3
 * image-to-video paints the `start_image_url` verbatim as frame 0 and then
 * morphs toward whatever the prompt describes — which produces a visible
 * "scene switch" in the first ~0.5–1s. We ask Kling for an extra 1s of
 * video, then trim that first second off to get a clean talking-head clip.
 *
 * Requires ffmpeg on $PATH. Locally: `brew install ffmpeg`.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { uploadFile, videoKey } from "./storage";

const execFileP = promisify(execFile);

export interface TrimResult {
  url: string;
  error?: string;
}

/**
 * Download a video, trim the first `startSeconds` from it via ffmpeg, and
 * re-upload the result to Supabase. Returns the new public URL.
 *
 * On any failure returns `{ url: originalUrl, error }` so the caller can
 * fall back to the un-trimmed video rather than breaking the pipeline.
 */
export async function trimVideoStart(
  videoUrl: string,
  startSeconds: number,
  userId: string,
  labelSuffix: string
): Promise<TrimResult> {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `trim-${crypto.randomBytes(4).toString("hex")}-`)
  );
  const inputPath = path.join(tmpDir, "in.mp4");
  const outputPath = path.join(tmpDir, "out.mp4");

  try {
    // 1. Download source video into /tmp
    const res = await fetch(videoUrl);
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(inputPath, buf);

    // 2. Trim: `-ss N` before `-i` uses fast seek (to nearest keyframe).
    //    `-c copy` avoids re-encoding for speed (sub-second on small clips).
    //    `-avoid_negative_ts make_zero` fixes playback start on some players.
    await execFileP(
      "ffmpeg",
      [
        "-y",
        "-ss",
        String(startSeconds),
        "-i",
        inputPath,
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        outputPath,
      ],
      { timeout: 60_000 }
    );

    // 3. Read trimmed file + upload to Supabase
    const outBuf = await fs.readFile(outputPath);
    const key = videoKey(userId, labelSuffix, "mp4");
    const url = await uploadFile(outBuf, key, "video/mp4");

    console.log(
      `[video-utils] Trimmed ${startSeconds}s off ${videoUrl.substring(
        videoUrl.lastIndexOf("/") + 1
      )} → ${url}`
    );
    return { url };
  } catch (err: any) {
    console.error(`[video-utils] trimVideoStart failed:`, err.message);
    return { url: videoUrl, error: err.message };
  } finally {
    // Clean up tmp files (don't block on failure)
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
