/**
 * Pipeline: Per-Cut Audio Segments
 *
 * Splits the full TTS script proportionally across cuts based on
 * duration, generates individual audio tracks for each segment,
 * and provides the data needed to align per-cut audio in the
 * Shotstack timeline instead of overlaying one long audio track.
 *
 * This produces tighter audio-video sync because each cut's
 * voiceover is exactly scoped to its content window.
 */

import { generateVoiceover, type TTSResult } from "@/lib/voice-engine";
import type { CutData } from "./types";

// ---- Types ---------------------------------------------------------------

export interface AudioSegment {
  url: string;
  duration: number;
  cutIndex: number;
}

export interface PerCutAudioResult {
  segments: AudioSegment[];
  /** True if all segments generated successfully */
  complete: boolean;
  /** Indices of cuts that failed audio generation (non-fatal) */
  failedCuts: number[];
}

// ---- Script Splitting ----------------------------------------------------

/**
 * Split a full TTS script proportionally across cuts based on each
 * cut's duration relative to the total video duration.
 *
 * Strategy:
 *  1. Tokenize the script into sentences (split on . ? ! followed by space).
 *  2. Distribute sentences to cuts proportional to duration weight.
 *  3. Ensure every cut with duration > 0 gets at least one sentence.
 *
 * Edge cases:
 *  - If there are fewer sentences than cuts, some cuts get empty strings.
 *  - If the script is empty, all segments are empty strings.
 */
export function splitScriptIntoCutSegments(
  script: string,
  cuts: CutData[]
): string[] {
  if (!script || !script.trim() || cuts.length === 0) {
    return cuts.map(() => "");
  }

  // Split into sentences, preserving punctuation
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    return cuts.map(() => "");
  }

  // Calculate duration weights
  const totalDuration = cuts.reduce((sum, c) => sum + c.duration, 0);
  if (totalDuration <= 0) {
    // Equal distribution if durations are invalid
    return distributeEvenly(sentences, cuts.length);
  }

  const weights = cuts.map((c) => c.duration / totalDuration);

  // Distribute sentences proportionally
  const segments: string[][] = cuts.map(() => []);
  let sentenceIdx = 0;

  for (let cutIdx = 0; cutIdx < cuts.length; cutIdx++) {
    // How many sentences this cut should get (fractional, then round)
    const targetCount = Math.max(1, Math.round(weights[cutIdx] * sentences.length));

    for (let j = 0; j < targetCount && sentenceIdx < sentences.length; j++) {
      segments[cutIdx].push(sentences[sentenceIdx]);
      sentenceIdx++;
    }
  }

  // Assign any remaining sentences to the last cut
  while (sentenceIdx < sentences.length) {
    segments[segments.length - 1].push(sentences[sentenceIdx]);
    sentenceIdx++;
  }

  return segments.map((group) => group.join(" "));
}

function distributeEvenly(sentences: string[], cutCount: number): string[] {
  const result: string[][] = Array.from({ length: cutCount }, () => []);
  sentences.forEach((s, i) => {
    result[i % cutCount].push(s);
  });
  return result.map((group) => group.join(" "));
}

// ---- Per-Cut Audio Generation --------------------------------------------

/**
 * Generate individual TTS audio for each text segment.
 * Uses the same generateVoiceover() from voice-engine.ts.
 *
 * Non-fatal: if a segment fails, we record it but continue.
 * The stitch step can fall back to the full audio track for
 * any cuts where per-cut audio is missing.
 */
export async function generatePerCutAudio(
  segments: string[],
  voiceId?: string
): Promise<PerCutAudioResult> {
  const results: AudioSegment[] = [];
  const failedCuts: number[] = [];

  // Generate sequentially to avoid rate-limit issues with TTS providers
  for (let i = 0; i < segments.length; i++) {
    const text = segments[i];

    // Skip empty segments (e.g., b-roll cuts with no voiceover)
    if (!text || text.trim().length < 5) {
      results.push({ url: "", duration: 0, cutIndex: i });
      continue;
    }

    try {
      const ttsResult: TTSResult = await generateVoiceover(text, voiceId);

      if (ttsResult.audioUrl) {
        results.push({
          url: ttsResult.audioUrl,
          duration: ttsResult.duration,
          cutIndex: i,
        });
      } else {
        console.warn(
          `[audio-sync] TTS failed for cut ${i}: ${ttsResult.error || "no audio URL"}`
        );
        results.push({ url: "", duration: 0, cutIndex: i });
        failedCuts.push(i);
      }
    } catch (err: any) {
      console.error(`[audio-sync] TTS exception for cut ${i}:`, err?.message);
      results.push({ url: "", duration: 0, cutIndex: i });
      failedCuts.push(i);
    }
  }

  return {
    segments: results,
    complete: failedCuts.length === 0,
    failedCuts,
  };
}

// ---- Shotstack Timeline Helper -------------------------------------------

/**
 * Build per-cut audio clips for a Shotstack timeline.
 *
 * Instead of one long audio track at start=0, this produces an
 * array of audio clip objects where each clip is aligned to
 * its corresponding video cut's start time.
 *
 * Usage in the stitch step:
 *   const audioClips = buildPerCutAudioClips(audioSegments, cuts);
 *   // Add as a track: tracks.push({ clips: audioClips });
 */
export function buildPerCutAudioClips(
  segments: AudioSegment[],
  cuts: CutData[],
  volume: number = 1
): Array<{
  asset: { type: "audio"; src: string; volume: number };
  start: number;
  length: number;
}> {
  const clips: Array<{
    asset: { type: "audio"; src: string; volume: number };
    start: number;
    length: number;
  }> = [];

  let currentTime = 0;

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];
    const segment = segments[i];

    if (segment && segment.url) {
      clips.push({
        asset: {
          type: "audio",
          src: segment.url,
          volume,
        },
        start: currentTime,
        length: cut.duration,
      });
    }

    currentTime += cut.duration;
  }

  return clips;
}
