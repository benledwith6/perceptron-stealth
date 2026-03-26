/**
 * UGC Analyzer — Deconstruct winning videos into replicable prompts
 *
 * From the course (Lesson 10):
 *   "The biggest mistake is thinking you can just wing it.
 *    Find what's already generating revenue. Break down why it works.
 *    Recreate it at scale."
 *
 * This module takes a reference video URL or description and
 * deconstructs it into a production-ready prompt template that
 * can be adapted for the user's character.
 *
 * The course says: "After 20 deconstructions, you will have 20
 * proven prompt templates. When a client needs a campaign: pull
 * a template, adapt it, launch 20 variations in an afternoon."
 */

import prisma from "./prisma";

const GOOGLE_AI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// ─── Types ──────────────────────────────────────────────────────

export interface VideoAnalysis {
  hook: string;              // exact opening hook used
  hookType: string;          // category (question, negative, curiosity, etc.)
  script: string;            // full script/dialogue extracted
  camerawork: string;        // camera angles, movement, framing
  lighting: string;          // lighting setup and quality
  environment: string;       // setting and background
  pacing: string;            // cut frequency, rhythm, tempo
  characterEnergy: string;   // performer's vibe and delivery style
  productInteraction: string; // how product/topic is shown
  promptTemplate: string;    // ready-to-use Sora/Kling/Seedance prompt
  hookVariations: string[];  // 5 alternative hooks
}

// ─── Analyzer ───────────────────────────────────────────────────

const ANALYZER_PROMPT = `You are the UGC ANALYZER — a specialized AI tool that deconstructs successful UGC videos into production-ready prompts for AI video generation.

Your job: Take a video description or reference and output a COMPLETE BREAKDOWN that can be used to replicate the video's success with a different character.

Analyze and extract:

1. THE HOOK — What's the exact opening line? What hook TYPE is it? (question, negative, taboo, controversial, curiosity, FOMO, personal experience, bold statement, problem-solution)

2. FULL SCRIPT — Transcribe or reconstruct the complete dialogue with stage directions.

3. CAMERAWORK — What angles are used? (close-up, medium, wide) Camera movement? (static, handheld, pan) Transitions? Cut frequency? Framing?

4. LIGHTING — Natural or artificial? Direction? Quality? Time of day feel?

5. ENVIRONMENT — Where is this filmed? What's in the background? What props are visible? What makes it feel authentic vs staged?

6. PACING — How fast are cuts? What's the rhythm? Where does energy peak? How long is each "beat"?

7. CHARACTER ENERGY — How does the performer carry themselves? Voice tone? Body language? What makes them believable?

8. PRODUCT/TOPIC INTERACTION — How is the product shown or topic discussed? Close-ups? Demonstration? Before/after?

9. PROMPT TEMPLATE — Write a COMPLETE production-ready prompt (in the style of the Nano Banana Pro course) that could recreate this video with a DIFFERENT character. Include camera specs, environment, character direction, dialogue, audio specs, anti-glitch rules.

10. HOOK VARIATIONS — Generate 5 alternative hooks that follow the same pattern but with different angles. (From the course: "Iterate on the formula, not copy it.")

Return a JSON object with these fields:
{
  "hook": "exact opening line",
  "hookType": "category",
  "script": "full script with stage directions",
  "camerawork": "detailed camera analysis",
  "lighting": "lighting breakdown",
  "environment": "setting analysis",
  "pacing": "rhythm and tempo analysis",
  "characterEnergy": "performer analysis",
  "productInteraction": "how product/topic is presented",
  "promptTemplate": "complete production-ready prompt for AI video generation",
  "hookVariations": ["hook 1", "hook 2", "hook 3", "hook 4", "hook 5"]
}`;

/**
 * Analyze a video description and extract a replicable prompt template.
 * Can accept either a text description of a winning video or a URL to analyze.
 */
export async function analyzeVideo(
  videoDescription: string
): Promise<VideoAnalysis | null> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `${GOOGLE_AI_STUDIO_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${ANALYZER_PROMPT}\n\nVIDEO TO ANALYZE:\n${videoDescription}\n\nDeconstruct this video now. Return valid JSON only.`,
            }],
          }],
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("[ugc-analyzer] Gemini error:", await response.text());
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    return JSON.parse(text) as VideoAnalysis;
  } catch (err) {
    console.error("[ugc-analyzer] Error:", err);
    return null;
  }
}

// ─── Prompt Library ─────────────────────────────────────────────

/**
 * Save a winning prompt template to the library.
 * These get stored in SystemConfig and can be browsed/reused from the admin panel.
 */
export async function saveToPromptLibrary(
  name: string,
  analysis: VideoAnalysis,
  userId: string
): Promise<void> {
  const key = `prompt_library_${userId}_${Date.now()}`;
  await prisma.systemConfig.create({
    data: {
      key,
      value: JSON.stringify({
        name,
        userId,
        hook: analysis.hook,
        hookType: analysis.hookType,
        promptTemplate: analysis.promptTemplate,
        hookVariations: analysis.hookVariations,
        savedAt: new Date().toISOString(),
      }),
      label: `Prompt: ${name}`,
      category: "prompt_library",
    },
  });
}

/**
 * Get all saved prompt templates from the library.
 */
export async function getPromptLibrary(userId: string): Promise<any[]> {
  const configs = await prisma.systemConfig.findMany({
    where: {
      category: "prompt_library",
      key: { startsWith: `prompt_library_${userId}_` },
    },
    orderBy: { updatedAt: "desc" },
  });

  return configs.map((c) => {
    try {
      return { id: c.id, key: c.key, ...JSON.parse(c.value) };
    } catch {
      return { id: c.id, key: c.key, name: c.label };
    }
  });
}
