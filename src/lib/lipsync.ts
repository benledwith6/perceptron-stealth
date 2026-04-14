/**
 * Lip-Sync Engine — FAL sync-lipsync/v2
 *
 * Takes a silent video (e.g. a Kling-generated talking head) plus an audio
 * clip (e.g. MiniMax TTS with the user's cloned voice) and returns a new
 * video URL where the subject's mouth is animated to match the audio.
 *
 * Model: fal-ai/sync-lipsync/v2
 *   - Typical processing time: ~80s for a 5s video
 *   - Output is trimmed to the audio clip's length
 *   - Response shape: { video: { url, content_type, file_name, file_size } }
 *
 * Failure mode is non-fatal: if this returns an error, callers should
 * fall back to the original silent video rather than blocking the flow.
 */

export interface LipSyncResult {
  videoUrl: string | null;
  error?: string;
}

/**
 * Lip-sync a silent video with an audio clip using FAL sync-lipsync/v2.
 *
 * @param videoUrl  Public URL of the silent source video (mp4)
 * @param audioUrl  Public URL of the target audio clip (mp3/wav)
 * @returns         Final lip-synced video URL (hosted by FAL — caller may
 *                  want to copy it to Supabase for permanence)
 */
export async function lipSyncVideo(
  videoUrl: string,
  audioUrl: string
): Promise<LipSyncResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    return { videoUrl: null, error: "FAL_API_KEY not set" };
  }

  try {
    // Step 1: Submit the lipsync job to FAL's queue
    const submitRes = await fetch(
      "https://queue.fal.run/fal-ai/sync-lipsync/v2",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify({
          video_url: videoUrl,
          audio_url: audioUrl,
        }),
      }
    );

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      return {
        videoUrl: null,
        error: `Submit failed ${submitRes.status}: ${errText.substring(0, 200)}`,
      };
    }

    const submitData = await submitRes.json();
    const requestId: string | undefined = submitData.request_id;
    const statusUrl: string | undefined = submitData.status_url;
    const responseUrl: string | undefined = submitData.response_url;

    if (!requestId || !statusUrl || !responseUrl) {
      return {
        videoUrl: null,
        error:
          "Missing request_id/status_url/response_url in submit response",
      };
    }

    console.log(`[lipsync] Submitted FAL job ${requestId}`);

    // Step 2: Poll status — typical completion ~80s, cap at ~5 min
    const MAX_POLLS = 60;
    const POLL_INTERVAL_MS = 5000;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!statusRes.ok) continue; // transient — retry on next tick
      const statusData = await statusRes.json();

      if (statusData.status === "COMPLETED") {
        break;
      }
      if (statusData.status === "FAILED" || statusData.status === "ERROR") {
        return {
          videoUrl: null,
          error: `FAL job failed: ${JSON.stringify(statusData).substring(0, 300)}`,
        };
      }
      if (i === MAX_POLLS - 1) {
        return {
          videoUrl: null,
          error: `Timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`,
        };
      }
    }

    // Step 3: Fetch the final result
    const resultRes = await fetch(responseUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!resultRes.ok) {
      return {
        videoUrl: null,
        error: `Failed to fetch result: ${resultRes.status}`,
      };
    }
    const result = await resultRes.json();
    const outUrl: string | undefined = result.video?.url;
    if (!outUrl) {
      return {
        videoUrl: null,
        error: `No video.url in result: ${JSON.stringify(result).substring(0, 200)}`,
      };
    }

    console.log(`[lipsync] Complete for job ${requestId}: ${outUrl}`);
    return { videoUrl: outUrl };
  } catch (err: any) {
    return { videoUrl: null, error: err.message };
  }
}
