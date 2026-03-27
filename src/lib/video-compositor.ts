/**
 * Video Compositor — Format-First Multi-Cut Pipeline
 *
 * CORE PRINCIPLE: A video is NEVER one AI generation call.
 * Every video is a sequence of CUTS — each cut is a separate generation
 * with its own prompt, camera angle, and purpose. Then we stitch.
 *
 * "My whole thesis with AI content is if you're trying to generate it
 *  all in one shot, it looks like crap. But if you splice it together,
 *  then it'll actually look good. It's like 8 AI videos of eight seconds,
 *  but you're only using three seconds from each."
 *
 * The FORMAT determines the cut pattern. A testimonial has different cuts
 * than a market update. The format is the blueprint.
 */

import { expandPrompt } from "./prompt-engine";

// ─── Types ──────────────────────────────────────────────────────

export interface Cut {
  index: number;
  type: "hook" | "talking_head" | "broll" | "product_shot" | "reaction" | "cta" | "transition";
  duration: number;          // how long this cut appears in final video
  generateDuration: number;  // how long to generate (always longer, we trim)
  prompt: string;            // generation prompt for this specific cut
  script?: string;           // dialogue-only portion (for TTS voiceover)
  camera: string;            // camera angle/style for this cut
  audio: string;             // what audio plays during this cut
  notes: string;             // editorial notes
}

export interface VideoFormat {
  id: string;
  name: string;
  description: string;
  totalDuration: number;
  cuts: Cut[];
}

export interface CompositionPlan {
  format: VideoFormat;
  startingFrameRequired: boolean;
  estimatedGenerations: number;  // total API calls needed
  estimatedTime: number;         // seconds to generate all cuts
}

// ─── Video Formats ──────────────────────────────────────────────

/**
 * Each format defines the CUT PATTERN for a type of video.
 * The prompts are templates — they get filled with user-specific
 * details by the prompt engine.
 *
 * Every cut generates MORE than we need (generateDuration > duration)
 * because we pick the best 2-3 seconds from a 5-8 second generation.
 */

const FORMATS: Record<string, (script: string) => VideoFormat> = {

  // ─── Talking Head (15s) ─────────────────────────────────
  // Hook → Main point → Supporting detail → CTA
  talking_head_15: (script) => ({
    id: "talking_head_15",
    name: "Talking Head (15s)",
    description: "Face-to-camera, single message, UGC style",
    totalDuration: 15,
    cuts: [
      {
        index: 0,
        type: "hook",
        duration: 3,
        generateDuration: 8,
        prompt: `HOOK CUT: Person looks at camera, slightly surprised expression like they just thought of something. Leans in slightly. Opens mouth to speak. iPhone selfie camera, raw UGC energy. The first 2 seconds must GRAB attention. ${script}`,
        camera: "iPhone front camera, handheld, slight wobble, face fills 60% of frame",
        audio: "Raw iPhone mic, room ambience, first words of the hook",
        notes: "Use first 3 seconds only. This is the scroll-stopper.",
      },
      {
        index: 1,
        type: "talking_head",
        duration: 5,
        generateDuration: 8,
        prompt: `MAIN POINT CUT: Person speaking directly to camera, natural gestures, making their key point. Conversational energy — like FaceTiming a friend. Slight head movements, natural blinks, real skin texture. ${script}`,
        camera: "Same iPhone angle as hook, continuous feel, medium close-up",
        audio: "Continuous speech, natural cadence with pauses and 'um's",
        notes: "Trim to best 5 seconds. Should feel like a natural continuation of the hook.",
      },
      {
        index: 2,
        type: "talking_head",
        duration: 4,
        generateDuration: 8,
        prompt: `SUPPORTING DETAIL CUT: Person elaborating on their point. Maybe leans back slightly, uses hand gesture to emphasize. Energy shifts from "telling you something" to "proving it." Natural, unrehearsed feel. ${script}`,
        camera: "Slight angle change — maybe person shifts position naturally",
        audio: "Continuous speech, slightly more animated",
        notes: "Trim to best 4 seconds. The 'evidence' or 'proof' section.",
      },
      {
        index: 3,
        type: "cta",
        duration: 3,
        generateDuration: 8,
        prompt: `CTA CUT: Person delivers final line — a call to action or closing thought. Direct eye contact, small nod or half-smile. Ends naturally — maybe reaches toward phone to stop recording, or gives a casual wave. ${script}`,
        camera: "Return to original angle, direct eye contact",
        audio: "Final sentence, natural trailing off, maybe a laugh",
        notes: "Trim to last 3 seconds. Must feel like a natural ending, not abrupt.",
      },
    ],
  }),

  // ─── Product/Testimonial (15s) ──────────────────────────
  // Hook → Show product → Experience → CTA
  testimonial_15: (script) => ({
    id: "testimonial_15",
    name: "Testimonial (15s)",
    description: "Product showcase with personal story",
    totalDuration: 15,
    cuts: [
      {
        index: 0,
        type: "hook",
        duration: 2,
        generateDuration: 5,
        prompt: `HOOK: Person holding or near the product/service context, looks at camera with genuine excitement or surprise. "Okay so..." energy. iPhone selfie, raw. ${script}`,
        camera: "iPhone front camera, close-up on face + product visible",
        audio: "First word of the hook, room presence audio",
        notes: "2 seconds max. Scroll-stopper.",
      },
      {
        index: 1,
        type: "talking_head",
        duration: 4,
        generateDuration: 8,
        prompt: `PROBLEM/BEFORE CUT: Person explains the problem they had or what they were looking for. Genuine frustration or curiosity in their expression. Natural hand gestures. ${script}`,
        camera: "Medium close-up, iPhone, slight handheld movement",
        audio: "Story-telling cadence, natural pauses",
        notes: "The 'before' state. Relatable problem.",
      },
      {
        index: 2,
        type: "broll",
        duration: 3,
        generateDuration: 5,
        prompt: `B-ROLL: Close-up of the product being used, or the service in action. Hands interacting with product naturally. Warm lighting, iPhone rear camera, macro-style close-up. Slow, intentional movement. ${script}`,
        camera: "iPhone rear camera, close-up/macro, steady handheld",
        audio: "Voiceover continues from previous cut (added in post)",
        notes: "Product hero shot. Slow, satisfying, tactile.",
      },
      {
        index: 3,
        type: "reaction",
        duration: 3,
        generateDuration: 8,
        prompt: `RESULT CUT: Person showing the result or expressing satisfaction. Maybe tilts face, shows off result, or holds product up with genuine smile. The "after" state. ${script}`,
        camera: "iPhone front camera, slightly wider than hook",
        audio: "Excited/satisfied tone, genuine reaction",
        notes: "The transformation moment.",
      },
      {
        index: 4,
        type: "cta",
        duration: 3,
        generateDuration: 5,
        prompt: `CTA: Person holds product to camera or gives final recommendation. Direct, genuine, not salesy. "Seriously, try it" energy. Natural ending — reaches to stop recording. ${script}`,
        camera: "iPhone front camera, product visible, direct eye contact",
        audio: "Final line, casual sign-off",
        notes: "Close the loop. Not a hard sell.",
      },
    ],
  }),

  // ─── Market Update / Educational (30s) ──────────────────
  // Hook → Point 1 → B-roll → Point 2 → B-roll → CTA
  educational_30: (script) => ({
    id: "educational_30",
    name: "Educational / Market Update (30s)",
    description: "Informational content with b-roll cutaways",
    totalDuration: 30,
    cuts: [
      {
        index: 0,
        type: "hook",
        duration: 3,
        generateDuration: 8,
        prompt: `HOOK: Person in their natural environment (home office, car, kitchen). Looks at camera with "oh you need to hear this" energy. Leans in. Raw, urgent, immediate. ${script}`,
        camera: "iPhone front camera, propped on surface, eye-level",
        audio: "Room presence, natural ambience of location",
        notes: "3 seconds. Make them stay.",
      },
      {
        index: 1,
        type: "talking_head",
        duration: 5,
        generateDuration: 8,
        prompt: `POINT 1: Person delivers first key insight. Animated but natural — the kind of energy you have when telling a friend something interesting you learned. Hand gestures for emphasis. ${script}`,
        camera: "Same setup as hook, continuous feel",
        audio: "Natural speech with emphasis and pauses",
        notes: "First piece of value. Must be interesting standalone.",
      },
      {
        index: 2,
        type: "broll",
        duration: 3,
        generateDuration: 5,
        prompt: `B-ROLL CUTAWAY: Visual that supports point 1. Could be: scrolling through data on a laptop, a neighborhood street scene, a document on a desk, a phone screen showing relevant info. Warm, natural lighting. ${script}`,
        camera: "iPhone rear camera, smooth handheld, close-up detail shots",
        audio: "Voiceover continues (added in post)",
        notes: "Visual proof / context for point 1.",
      },
      {
        index: 3,
        type: "talking_head",
        duration: 5,
        generateDuration: 8,
        prompt: `POINT 2: Person delivers second insight, building on the first. Maybe stands up, walks to window, or shifts position. Energy builds slightly — this is the "and here's why it matters" beat. ${script}`,
        camera: "Slight angle change from new position, still iPhone",
        audio: "More animated speech, building energy",
        notes: "Second piece of value. The 'so what' factor.",
      },
      {
        index: 4,
        type: "broll",
        duration: 3,
        generateDuration: 5,
        prompt: `B-ROLL CUTAWAY: Visual supporting point 2. Different angle/subject than first b-roll. Could be: walking through a space, typing on laptop, looking at phone, pointing at something off-screen. ${script}`,
        camera: "iPhone rear camera, different composition than first b-roll",
        audio: "Voiceover continues (added in post)",
        notes: "Visual variety. Don't repeat the first b-roll style.",
      },
      {
        index: 5,
        type: "talking_head",
        duration: 5,
        generateDuration: 8,
        prompt: `SYNTHESIS: Person ties both points together. The "big picture" moment. Calmer energy, more thoughtful. Maybe a knowing nod or a pause before the final thought. ${script}`,
        camera: "Return to original position/angle, grounding the viewer",
        audio: "Slower, more deliberate speech",
        notes: "Connect the dots. Make them feel smart.",
      },
      {
        index: 6,
        type: "cta",
        duration: 3,
        generateDuration: 5,
        prompt: `CTA: Quick, natural close. "Follow for more" energy but without saying those words. Maybe a casual point at camera, a nod, or just reaches to stop recording mid-thought. ${script}`,
        camera: "Same as original setup, direct eye contact",
        audio: "Quick final line, natural ending",
        notes: "Don't overdo it. Best CTAs feel accidental.",
      },
      {
        index: 7,
        type: "transition",
        duration: 3,
        generateDuration: 5,
        prompt: `END CARD / LOGO MOMENT: Clean, simple shot of the person's workspace or environment without them in frame. Natural light, settling moment. Or person walking away from camera. ${script}`,
        camera: "Static iPhone shot of environment, no person",
        audio: "Room tone only, fading",
        notes: "Breathing room. Let the content land.",
      },
    ],
  }),

  // ─── Quick Tip / Reel (8s) ──────────────────────────────
  // Even an 8-second video is 3 cuts, not 1
  quick_tip_8: (script) => ({
    id: "quick_tip_8",
    name: "Quick Tip (8s)",
    description: "Rapid-fire single tip, 3 cuts",
    totalDuration: 8,
    cuts: [
      {
        index: 0,
        type: "hook",
        duration: 2,
        generateDuration: 5,
        prompt: `HOOK: Person with urgent "stop scrolling" energy. Close to camera, slightly wide-eyed, about to drop knowledge. One sharp opening line. ${script}`,
        camera: "iPhone front camera, face fills frame, raw",
        audio: "First 2 words, punchy",
        notes: "2 seconds. Interrupt the scroll.",
      },
      {
        index: 1,
        type: "talking_head",
        duration: 4,
        generateDuration: 8,
        prompt: `THE TIP: Person delivers the actual tip/insight in one breath. Fast but clear. Uses one definitive hand gesture. Eyes locked on camera. Energy: "I'm telling you this for free and you're welcome." ${script}`,
        camera: "Pull back slightly from hook, more of upper body visible",
        audio: "Rapid delivery, confident, no filler words",
        notes: "The meat. One clear takeaway.",
      },
      {
        index: 2,
        type: "cta",
        duration: 2,
        generateDuration: 5,
        prompt: `CLOSE: Person raises eyebrows like "you're welcome", gives micro-nod, maybe mouths "trust me" or just smirks. Reaches to stop recording. ${script}`,
        camera: "Return to tight framing, direct eye contact",
        audio: "One final word or just a confident exhale",
        notes: "Land it. Confidence, not desperation.",
      },
    ],
  }),
};

// ─── Public API ─────────────────────────────────────────────────

/**
 * Create a composition plan from a format ID and script.
 * The format determines the cut pattern.
 * The script gets distributed across cuts by the prompt engine.
 */
export function planComposition(
  formatId: string,
  script: string
): CompositionPlan {
  const formatFn = FORMATS[formatId] || FORMATS.talking_head_15;
  const format = formatFn(script);

  return {
    format,
    startingFrameRequired: true, // always — consistency across cuts
    estimatedGenerations: format.cuts.length,
    estimatedTime: format.cuts.length * 30, // ~30s per generation
  };
}

/**
 * Expand every cut's prompt through the prompt engine.
 * Each cut gets its own fully-detailed production prompt
 * with character details, anti-glitch rules, etc.
 */
export async function expandCutPrompts(
  plan: CompositionPlan,
  userId: string,
  model: string,
  industry?: string
): Promise<CompositionPlan> {
  // Process cuts sequentially to avoid Gemini API rate limiting.
  // Parallel Promise.all with 4-8 concurrent calls consistently triggers 429s.
  const expandedCuts: typeof plan.format.cuts = [];
  for (const cut of plan.format.cuts) {
    try {
      const expanded = await expandPrompt({
        userRequest: `${cut.prompt}\n\nCAMERA FOR THIS CUT: ${cut.camera}\nAUDIO FOR THIS CUT: ${cut.audio}\nEDITORIAL NOTE: ${cut.notes}`,
        model,
        userId,
        industry,
        duration: cut.generateDuration,
      });
      expandedCuts.push({ ...cut, prompt: expanded.expandedPrompt, script: expanded.script });
    } catch {
      expandedCuts.push(cut);
    }
  }

  return {
    ...plan,
    format: { ...plan.format, cuts: expandedCuts },
  };
}

/**
 * Get all available format IDs and their descriptions.
 */
export function getAvailableFormats(): { id: string; name: string; description: string; totalDuration: number; cutCount: number }[] {
  return Object.entries(FORMATS).map(([id, fn]) => {
    const format = fn("");
    return {
      id,
      name: format.name,
      description: format.description,
      totalDuration: format.totalDuration,
      cutCount: format.cuts.length,
    };
  });
}

/**
 * Build FFmpeg command to stitch downloaded cut files into one video.
 * Each cut is trimmed to its `duration` from the generated `generateDuration`.
 */
export function buildStitchCommand(
  cutFiles: { path: string; trimTo: number }[],
  outputPath: string
): string {
  if (cutFiles.length === 1) {
    const c = cutFiles[0];
    return `ffmpeg -i "${c.path}" -t ${c.trimTo} -c copy "${outputPath}"`;
  }

  // Complex filter: trim each input then concat
  const inputs = cutFiles.map((c) => `-i "${c.path}"`).join(" ");
  const filters = cutFiles.map((c, i) => `[${i}:v]trim=0:${c.trimTo},setpts=PTS-STARTPTS[v${i}];[${i}:a]atrim=0:${c.trimTo},asetpts=PTS-STARTPTS[a${i}]`).join(";");
  const concatV = cutFiles.map((_, i) => `[v${i}]`).join("");
  const concatA = cutFiles.map((_, i) => `[a${i}]`).join("");

  return `ffmpeg ${inputs} -filter_complex "${filters};${concatV}concat=n=${cutFiles.length}:v=1:a=0[outv];${concatA}concat=n=${cutFiles.length}:v=0:a=1[outa]" -map "[outv]" -map "[outa]" "${outputPath}"`;
}
