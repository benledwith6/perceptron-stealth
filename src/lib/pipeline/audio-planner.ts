/**
 * Audio Planner — Audio-Driven Video Duration Planning
 *
 * Closes the #2 data flow gap: audio duration now drives video duration.
 *
 * Previously, TTS generated one blob and video cuts had arbitrary durations
 * (5s or 10s) independent of the audio. A person could be "talking" for 3s
 * in audio but the video would be 5s of staring.
 *
 * Now:
 *  1. The script is split proportionally across cuts.
 *  2. TTS generates audio for each segment individually.
 *  3. The actual audio duration determines the video generation duration.
 *  4. Video duration is clamped to Kling's valid values (5 or 10).
 *
 * The audio-sync module handles the splitting and per-cut TTS generation.
 * This module adds the duration-planning layer on top.
 */

import {
  splitScriptIntoCutSegments,
  generatePerCutAudio,
  type AudioSegment,
} from "./audio-sync";
import type { CutData } from "./types";

// ---- Types ----------------------------------------------------------------

export interface CutAudioEntry {
  /** Audio URL for this cut segment */
  url: string;
  /** Actual audio duration in milliseconds */
  durationMs: number;
  /** The text segment spoken in this cut */
  segment: string;
}

export interface AudioPlanResult {
  /** Per-cut audio data aligned by index */
  cutAudio: CutAudioEntry[];
  /** Whether all cuts got audio successfully */
  complete: boolean;
  /** Indices of cuts where audio generation failed */
  failedCuts: number[];
}

// ---- Duration Planning ----------------------------------------------------

/**
 * Given an audio duration in milliseconds, return the video generation
 * duration that should be used for FAL/Kling.
 *
 * Kling only accepts 5 or 10. We pick the NEAREST valid value that
 * fully covers the audio:
 *  - Audio <= 5s  -> generate 5s video
 *  - Audio > 5s   -> generate 10s video
 *  - Audio > 10s  -> generate 10s video (cap)
 *
 * The `minDuration` parameter allows a floor (e.g., a hook cut might
 * want at least 5s even if audio is only 2s).
 */
export function getVideoDurationFromAudio(
  audioDurationMs: number,
  minDuration: number = 5
): number {
  const audioSeconds = audioDurationMs / 1000;

  // Apply minimum duration floor
  const effectiveDuration = Math.max(audioSeconds, minDuration);

  // Kling valid durations: 5 or 10
  if (effectiveDuration <= 5) return 5;
  return 10;
}

// ---- Script Split for Cuts ------------------------------------------------

/**
 * Split the spoken script proportionally across cuts based on their
 * target duration.
 *
 * Hook gets the first sentence(s). Talking head gets the bulk. CTA gets
 * the closing line(s).
 *
 * Delegates to audio-sync's splitScriptIntoCutSegments for the actual
 * proportional distribution, which handles edge cases like fewer
 * sentences than cuts.
 */
export function splitScriptForCuts(
  fullScript: string,
  cuts: { type: string; duration: number }[]
): string[] {
  // Convert to CutData shape expected by splitScriptIntoCutSegments
  const cutData: CutData[] = cuts.map((c, i) => ({
    index: i,
    type: c.type,
    duration: c.duration,
    generateDuration: c.duration, // not used for splitting, just satisfying the type
    prompt: "",
  }));

  return splitScriptIntoCutSegments(fullScript, cutData);
}

// ---- Per-Cut Audio Generation with Duration --------------------------------

/**
 * Generate TTS for each script segment individually and return
 * the audio URL, actual duration in milliseconds, and the text segment.
 *
 * This is the key function that closes the data flow gap: by generating
 * audio per-cut, we get the actual spoken duration for each segment,
 * which then drives the video generation duration.
 *
 * Non-fatal: if a segment fails TTS, we record it as zero duration
 * and the cut step will fall back to the default generateDuration
 * from the composition plan.
 */
export async function generatePerCutAudioWithDuration(
  segments: string[],
  voiceId?: string
): Promise<AudioPlanResult> {
  const result = await generatePerCutAudio(segments, voiceId);

  const cutAudio: CutAudioEntry[] = result.segments.map((seg, i) => ({
    url: seg.url,
    // audio-sync returns duration in seconds, convert to ms
    durationMs: seg.duration * 1000,
    segment: segments[i] || "",
  }));

  return {
    cutAudio,
    complete: result.complete,
    failedCuts: result.failedCuts,
  };
}
