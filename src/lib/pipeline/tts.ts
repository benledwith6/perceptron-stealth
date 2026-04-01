/**
 * Pipeline Step: TTS
 *
 * Generates text-to-speech audio from the original user script.
 * Uses the original script (not the expanded cut prompts) because
 * the expanded prompts are camera/production directions, not speech.
 *
 * Audio-driven video duration planning (fixes #2 data flow gap):
 *   1. Splits the script proportionally across cuts.
 *   2. Generates TTS for each segment individually.
 *   3. Stores per-cut audio URLs and actual durations in meta.cutAudio.
 *   4. The cut step reads meta.cutAudio[cutIndex].durationMs to determine
 *      the video generation duration (5s or 10s) that covers the audio.
 *
 * TTS failure is non-fatal -- the pipeline continues without audio
 * and the cut step falls back to the default generateDuration.
 */

import prisma from "@/lib/prisma";
import { downloadAndStore, audioKey, isStorageConfigured } from "@/lib/storage";
import {
  splitScriptForCuts,
  generatePerCutAudioWithDuration,
} from "./audio-planner";
import { parseMeta, stringifyMeta } from "./types";
import type { CutAudioEntry } from "./types";
import type { StepResult } from "./types";

export async function handleTTS(videoId: string, userId: string): Promise<StepResult> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { script: true, sourceReview: true },
  });

  if (!video) {
    return { status: "error", error: "Video not found" };
  }

  const meta = parseMeta(video.sourceReview);
  meta.pipelineStep = "tts";
  await prisma.video.update({
    where: { id: videoId },
    data: { sourceReview: stringifyMeta(meta) },
  });

  // Use the original user script for TTS, not the expanded cut prompts
  const ttsScript = meta.originalScript || video.script || "";
  let cutAudio: CutAudioEntry[] = [];
  let ttsAudioUrl: string | null = null;

  if (ttsScript && ttsScript.length > 10 && meta.cuts.length > 0) {
    try {
      // Step 1: Split script proportionally across cuts
      const segments = splitScriptForCuts(
        ttsScript,
        meta.cuts.map((c) => ({ type: c.type, duration: c.duration }))
      );

      console.log(
        `[pipeline/tts] Split script into ${segments.length} segments for ${meta.cuts.length} cuts`
      );

      // Step 2: Generate TTS for each segment individually
      // Thread voiceCloneId from pipeline meta (set by onboarding preview-video)
      const voiceCloneId = (meta as any).voiceCloneId as string | undefined;
      const audioResult = await generatePerCutAudioWithDuration(segments, voiceCloneId);

      console.log(
        `[pipeline/tts] Per-cut audio: ${audioResult.complete ? "all succeeded" : `${audioResult.failedCuts.length} failed`}`
      );

      // Step 3: Persist per-cut audio to storage if configured
      cutAudio = await Promise.all(
        audioResult.cutAudio.map(async (entry, i) => {
          if (!entry.url) return entry;

          // Persist to storage if it's an external URL (not a data: URI)
          if (isStorageConfigured() && !entry.url.startsWith("data:")) {
            try {
              const storedUrl = await downloadAndStore(
                entry.url,
                audioKey(userId, `tts-${videoId}-cut-${i}`, "mp3"),
                "audio/mpeg"
              );
              return { ...entry, url: storedUrl };
            } catch (err) {
              console.error(
                `[pipeline/tts] Failed to persist cut ${i} audio to storage, using temp URL:`,
                err
              );
            }
          }

          return entry;
        })
      );

      // Step 4: Also store the first cut's audio as the legacy ttsAudioUrl
      // for backward compatibility (e.g., single-cut videos)
      const firstWithAudio = cutAudio.find((e) => e.url);
      ttsAudioUrl = firstWithAudio?.url || null;
    } catch (err) {
      console.error("[pipeline/tts] Per-cut TTS failed:", err);
      // Non-fatal -- continue without audio. cutAudio stays empty
      // and the cut step will use default generateDuration values.
    }
  }

  // Re-read fresh meta to avoid overwriting concurrent updates
  const freshVideo = await prisma.video.findUnique({
    where: { id: videoId },
    select: { sourceReview: true },
  });
  const freshMeta = parseMeta(freshVideo?.sourceReview);
  freshMeta.ttsAudioUrl = ttsAudioUrl;
  freshMeta.cutAudio = cutAudio;
  await prisma.video.update({
    where: { id: videoId },
    data: { sourceReview: stringifyMeta(freshMeta) },
  });

  const hasAudio = cutAudio.some((e) => !!e.url);

  return {
    status: "tts_done",
    nextStep: "anchor",
    data: {
      hasAudio,
      cutAudioCount: cutAudio.filter((e) => !!e.url).length,
      totalCuts: meta.cuts.length,
    },
  };
}
