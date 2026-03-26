/**
 * Hook Variation Generator
 *
 * From the course (Lesson 10):
 *   "The hook is everything. Your job: iterate on the formula, not copy it."
 *
 * From Dara Denney:
 *   "THE 3-SECOND RULE: Hook must deliver core impact within 3 seconds."
 *   "Creative Fatigue: High-performing hooks experience 37% performance
 *    drop after 7 DAYS. Refresh weekly."
 *
 * Generates 5 hook variations for every video so users can pick the
 * best one or A/B test them.
 */

const GOOGLE_AI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface HookVariation {
  hook: string;
  type: string;    // question, negative, curiosity, personal, controversial, FOMO
  energy: string;  // calm, urgent, conspiratorial, excited, thoughtful
}

const HOOK_PROMPT = `You are a UGC hook specialist. Generate exactly 5 hook variations for a video.

RULES FROM TOP PERFORMERS:
- The 3-Second Rule: core impact in 3 seconds
- 85% of social media consumed on MUTE — hook must work visually too
- Never start with "Hey guys" or "Welcome back" — that's amateur hour
- Each hook should be a DIFFERENT TYPE:
  1. Question Hook: "What's the biggest mistake you're making in [X]?"
  2. Negative/Problem Hook: "Stop making this one mistake that's killing your [X]."
  3. Curiosity/Conspiracy Hook: "What if I told you..." or "Okay so this is wild..."
  4. Personal Experience Hook: "I wasn't gonna post this but..."
  5. Bold/Controversial Hook: "Everyone's wrong about [X]. Here's why."

Each hook must:
- Be under 15 words
- Sound like it was said mid-thought, not scripted
- Include natural speech patterns (pauses, "um", "like", "honestly")
- Work as the opening of a vertical video filmed on an iPhone
- Make someone STOP scrolling

Return a JSON array of exactly 5 objects:
[{ "hook": "the hook text", "type": "question|negative|curiosity|personal|bold", "energy": "calm|urgent|conspiratorial|excited|thoughtful" }]`;

function getFallbackHooks(topic: string): HookVariation[] {
  return [
    { hook: `Okay real quick — ${topic}`, type: "curiosity", energy: "urgent" },
    { hook: `Stop what you're doing. ${topic}`, type: "bold", energy: "conspiratorial" },
    { hook: `I wasn't gonna post this but... ${topic}`, type: "personal", energy: "thoughtful" },
    { hook: `Everyone's getting this wrong about ${topic}`, type: "negative", energy: "calm" },
    { hook: `What if I told you ${topic} is not what you think?`, type: "curiosity", energy: "excited" },
  ];
}

export async function generateHookVariations(
  topic: string,
  industry?: string
): Promise<HookVariation[]> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    // Fallback hooks
    return [
      { hook: `Okay real quick — ${topic}`, type: "curiosity", energy: "urgent" },
      { hook: `Stop what you're doing. ${topic}`, type: "bold", energy: "conspiratorial" },
      { hook: `I wasn't gonna post this but... ${topic}`, type: "personal", energy: "thoughtful" },
      { hook: `Everyone's getting this wrong about ${topic}`, type: "negative", energy: "calm" },
      { hook: `What if I told you ${topic} is not what you think?`, type: "curiosity", energy: "excited" },
    ];
  }

  try {
    const response = await fetch(
      `${GOOGLE_AI_STUDIO_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${HOOK_PROMPT}\n\nTOPIC: "${topic}"\nINDUSTRY: ${industry || "general"}\n\nGenerate 5 hooks now. Return valid JSON array only.`,
            }],
          }],
          generationConfig: {
            temperature: 0.9, // high creativity for hooks
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("[hook-generator] Gemini error:", response.status);
      return getFallbackHooks(topic);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return getFallbackHooks(topic);

    const parsed = JSON.parse(text) as HookVariation[];
    // Validate that we got a non-empty array
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return getFallbackHooks(topic);
    }
    return parsed;
  } catch (err) {
    console.error("[hook-generator] Error:", err);
    return getFallbackHooks(topic);
  }
}
