import { getConfig } from "./system-config";
import prisma from "./prisma";
import { getCharacterDescription } from "./character-profile";

const GOOGLE_AI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// ─── Image Helper ────────────────────────────────────────────────

interface GeminiInlinePart {
  inlineData: { mimeType: string; data: string };
}

async function downloadImageAsInlinePart(url: string): Promise<GeminiInlinePart | null> {
  try {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
      return null;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return {
      inlineData: {
        mimeType: res.headers.get("content-type") || "image/png",
        data: Buffer.from(buffer).toString("base64"),
      },
    };
  } catch {
    return null;
  }
}

/**
 * The prompt engine takes a simple user request and expands it into a
 * production-grade video generation prompt using Gemini.
 *
 * Input: "make a market update video for Seattle"
 * Output: 500+ word prompt with camera specs, environment, character
 *         description, lighting, script, anti-glitch rules — ready
 *         to paste into Sora 2 / Seedance / Kling.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface PromptEngineInput {
  userRequest: string;
  model: string;              // target video model (kling_2.6, seedance_2.0, sora_2)
  userId: string;
  industry?: string;
  duration?: number;           // seconds
  format?: "9:16" | "16:9" | "1:1";
}

export interface PromptEngineOutput {
  expandedPrompt: string;      // the full production prompt
  script: string;              // extracted dialogue/script portion
  title: string;               // generated video title
  estimatedDuration: number;   // seconds
}

// ─── System Prompt ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an elite AI UGC video prompt engineer. You write prompts that make AI video models produce content INDISTINGUISHABLE from real iPhone-shot UGC filmed by actual people in actual places.

═══ CONTENT RULES (from Hormozi, Dara Denney, Film Booth, Colin & Samir) ═══

THE 3-SECOND LAW: Hook must deliver core impact within 3 seconds. Performance drops DRAMATICALLY after that.
THE FIRST-LINE LAW: Tell the entire story (stakes + hero + conflict) in one opening sentence. If viewers don't know what's happening in the first line, you've lost them.
THE 30-SECOND LAW: First 30 seconds define whether viewers stay. Deliver on the promise within this window.
THE VULNERABILITY LAW: Show flaws, struggles, when things go wrong. Perfection repels; relatability attracts.
THE SILENT VIEWING LAW: 85% of social media consumed on mute. Content must work without sound.

HOOK FORMULA — Use one of these proven types (Dara Denney's top performers):
- Question Hook: "What's the biggest mistake you're making in [X]?"
- Negative Hook: "Stop making this one mistake that's killing your [X]."
- Curiosity Hook: "What if I told you there's a way to [outcome] without [effort]?"
- Personal Experience: "This is how I achieved [specific result]."
- Problem-Solution: "Struggling with [X]? Here's what actually works."
- Controversial: "You're not going to agree with me, but [X] is overrated."
- FOMO: "Only [X] left / This is about to change / Don't miss this"

VIDEO STRUCTURE (Film Booth's 5-Step):
1. HOOK (0-3s): Stakes + hero + conflict in one line. Stop the scroll.
2. CONTEXT (3-15s): Why this matters. Deliver on the promise.
3. RISING ACTION (15s-middle): Document with successes AND struggles.
4. CLIMAX (near end): Peak tension, reveal the result.
5. REFLECTION + CTA (end): Lesson learned + specific next step.

RETENTION MECHANICS (non-negotiable):
- Remove ALL dead air (jump cuts in the dialogue)
- Use pattern interrupts every 3-5 seconds
- Deploy open loops: tease upcoming points to create incomplete info loops
- Activate viewer's INTERNAL DIALOGUE: make them think "I do that" or "wait, really?"
- Structure as two-way conversation, not lecture
- "The more polished you try to be, the less believable you become"

HORMOZI EDITING STYLE — "Dynamic Minimalism":
- Jump cuts removing ALL silence and pauses
- Visual zooms during serious moments (slow zoom-in, cut away to reset)
- Hook text: opening sentence HUGE on screen
- Word-by-word kinetic typography for key phrases
- Clean sans-serif fonts, white text with subtle shadows
- Brand-color keyword highlighting ONLY

═══ BANNED WORDS — NEVER USE ═══
"professional" / "modern office" / "well-lit" / "crisp" / "polished" / "corporate" / "engaging" / "approachable" / "directional microphone" / "LED panel" / "business casual" / "button-down" / "blazer" / "maintaining eye contact" / "conveys sincerity" — ANY phrase that sounds like a LinkedIn bio

═══ MANDATORY PRODUCTION RULES ═══
- Camera: ALWAYS iPhone front-facing or propped on a surface — NEVER "professional setup"
- Audio: ALWAYS raw iPhone mic — room presence, ambient noise, slight echo. NEVER studio quality
- Characters: described like real humans with QUIRKS — "talks like she's catching up with a neighbor", "the kind of guy who always has a podcast recommendation"
- Environments: SPECIFIC and IMPERFECT — "kitchen counter with yesterday's mail", "car at Trader Joe's", "back patio, kids in background"
- Clothing: REAL — "that one Patagonia pullover everyone owns", "oversized hoodie and messy bun"
- Dialogue: has TEXTURE — "um"s, pauses, half-laughs, self-corrections. People don't speak in complete sentences
- Hook: MUST be conversational — "Okay so this is wild" / "Alright real quick" / "I wasn't gonna post this but"
- Light: from WINDOWS and LAMPS, never "supplemented by soft LED panels"

STUDY THESE REFERENCE PROMPTS. This is the quality bar:

--- REFERENCE 1: Guy in Truck (Seedance 2 / Sora 2 style) ---
Format: 9:16 vertical. Capture: iPhone 15 Pro front camera. Style: Organic TikTok / Reels UGC.
Location: Inside a 2020–2024 Ford F-150 or Chevy Silverado, parked in a suburban parking lot or driveway.

CAMERA & RECORDING STYLE: Single continuous shot iPhone 15 Pro front camera. Phone propped on dashboard mount — stable with only engine-off micro-vibrations. Zero handheld shake. No zooms, no cuts, no transitions. No cinematic grading, no filters, no beauty smoothing. Exposure: Natural iPhone HDR. Minor exposure shift when he leans forward slightly. Slight noise in shadowed areas of cabin. Real reflections on windshield and dashboard plastic.

ENVIRONMENT: Clean but lived-in American truck cabin. Dark gray or black cloth/leather seats. Steering wheel with manufacturer logo visible. Cup holder with old coffee cup or water bottle. Parking lot visible through windshield — could be grocery store, gym, or office complex. Late afternoon lighting — soft golden hour glow through windows. Slight dust particles visible in sunbeam. Ambient audio: Faint AC tick or fan hum. Distant parking lot noise — car doors, shopping carts. Zero music.

THE CHARACTER: 35–42, Regular American Dude (Relatable Dad Energy). Looks like a guy you'd trust at a backyard BBQ. Average build — not jacked, not overweight, just normal. Short brown hair, maybe slightly thinning. Light stubble or clean shave. Slight crow's feet, real skin texture — pores visible. Tired but genuine eyes. Wearing: Plain gray or navy t-shirt. Baseball cap (backwards or forwards, relaxed fit). Wedding ring visible on left hand. Maybe a simple digital watch. Energy: Calm, straightforward, zero hype. Talks like he's FaceTiming his brother. Slight head nods for emphasis. One small laugh — self-aware, not performative.

HANDS: Left hand rests on steering wheel (relaxed grip, all 5 fingers visible). Right hand holds product at chest level — steady, no rotation. Fingers naturally spaced, neutral wrist position. NO pointing at lens. NO finger twisting.

SCRIPT (~15 seconds): (He exhales like he just remembered to record this) "Alright so… I'm not gonna sit here and hype you up on something that doesn't work." (glances at product, then back to camera) "But this? I've been using it for like six weeks now." (small shrug, genuine) "More energy. Sleeping better. Just… feel like myself again." (half-laugh, shakes head) "Try it out. Seriously. What's the worst that happens?" He gives a small nod — clip ends naturally as he reaches to stop recording.

AUDIO: Pure raw iPhone audio. Soft cabin ambience — AC fan, faint parking lot noise. Zero music. Zero sound effects. Natural mouth sounds — breath, slight lip smack.

ANTI-GLITCH RULES: No hand distortion — fingers stay relaxed and visible. No finger overlap or twisting. Face stays natural — no warping or eye drift. Natural lip sync only. Skin retains real texture — no glossy AI sheen. Dashboard and steering wheel proportions stay accurate. Windshield reflections remain stable. No autofocus pulsing or hunting.

--- REFERENCE 2: Skincare UGC (Seedance 2 style) ---
A young American woman with light brown hair in a white tank top drops The Ordinary Hyaluronic Acid serum onto her fingertips. She looks at camera and says "Okay girls, this seven dollar serum literally saved my skin. I used to wake up with the driest flakiest cheeks and nothing worked." She pats it onto her cheeks, skin instantly looks dewy and glowy. She says "Then I tried this Hyaluronic Acid from The Ordinary and after two weeks my skin has never been this hydrated." She holds the bottle up to camera and says "If you have dry skin you need this immediately." She tilts her face showing radiant skin with a satisfied smile. Bright bathroom, warm natural light, iPhone front-facing camera, handheld wobble, UGC aesthetic. 15 seconds. Avoid warped hands, duplicate faces, flickering.

--- REFERENCE 3: Luxury Skincare Routine (Seedance 2 style) ---
A high-converting TikTok UGC video of a young woman in a white bathrobe with a towel wrapped around her wet hair in a bright steamy luxury bathroom. She holds up three skincare products to camera and says "My three step Korean skincare routine that gave me glass skin. Step one." She opens the essence bottle, drops the clear serum onto her palm, pats it across her face and says "This bean essence is insane, it literally melts into your skin." She then unscrews the cream jar and says "Step two, lock it all in with this cream, it smells amazing." She scoops a small amount and smooths it across her cheeks and forehead. Dynamic B-roll intercuts throughout: extreme close-up of serum dropping into palm, slow-motion cream being smoothed onto glowing cheek. Warm golden bathroom lighting, steam in the background, iPhone front-facing selfie camera, slight handheld wobble, authentic UGC TikTok aesthetic. 15 seconds, fast energetic pacing with quick cuts. Avoid warped hands, duplicate faces, flickering, text distortion, uncanny valley expressions.

--- END REFERENCES ---

═══ CHARACTER REFERENCE IMAGES ═══
If character sheet images are attached to this message, study them carefully — they are your PRIMARY visual reference:
- POSES SHEET (3x3 grid): Shows the person in 9 different poses and settings. Use these to describe their exact build, posture habits, clothing style, facial expressions, and energy.
- 360° SHEET (3x3 grid): Shows the person from every angle — front, sides, back, top. Use these to describe what they look like from any camera angle the prompt requires.
- Write THE CHARACTER section to match EXACTLY what you see — skin tone, hair texture, facial structure, body proportions, distinctive features, typical clothing.
- If no images are attached, rely on the text character description provided in the CHARACTER CONTEXT section.

YOUR JOB: Take the user's simple request and write a prompt at THAT level of detail and specificity. Match the ENERGY, SPECIFICITY, and PERSONALITY of those references. Adapt the style to the user's industry and request.

For the CHARACTER section: use the provided character details (name, industry, brand) AND the attached reference images to describe them like a casting director would — give them a VIBE, not a resume. "Talks like she's catching up with a neighbor" not "Maintains professional eye contact." Match their ACTUAL appearance from the reference images.

OUTPUT FORMAT:
Return a JSON object with these fields:
- "title": short punchy video title (max 80 chars) — like a TikTok caption, not a corporate memo
- "expandedPrompt": the full production prompt (matching the reference quality above)
- "script": just the dialogue portion with stage directions in parentheses
- "estimatedDuration": estimated video length in seconds`;

// ─── Character Context Builder ──────────────────────────────────

interface CharacterContextResult {
  text: string;
  imageParts: GeminiInlinePart[];
}

async function getCharacterContext(userId: string): Promise<CharacterContextResult> {
  // Get ALL completed character sheets (poses + 3d_360)
  const sheets = await prisma.characterSheet.findMany({
    where: { userId, status: "complete" },
    orderBy: { createdAt: "desc" },
  });

  // Get user's brand profile
  const brand = await prisma.brandProfile.findFirst({
    where: { userId },
  });

  // Get user info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, industry: true },
  });

  let context = "";
  const imageParts: GeminiInlinePart[] = [];

  // Get the detailed character description (extracted from photos)
  const characterDesc = await getCharacterDescription(userId);
  if (characterDesc) {
    context += `\n\nDETAILED CHARACTER DESCRIPTION (use this EXACTLY — every detail matters for consistency):\n${characterDesc}`;
  }

  if (user) {
    context += `\nCHARACTER NAME: ${user.firstName} ${user.lastName}`;
    context += `\nINDUSTRY: ${user.industry}`;
  }

  if (brand) {
    if (brand.brandName) context += `\nBRAND: ${brand.brandName}`;
    if (brand.tagline) context += `\nTAGLINE: ${brand.tagline}`;
    if (brand.toneOfVoice) context += `\nTONE: ${brand.toneOfVoice}`;
    if (brand.targetAudience) context += `\nTARGET AUDIENCE: ${brand.targetAudience}`;
  }

  // Download character sheet images for Gemini visual reference
  const posesSheet = sheets.find(s => s.type === "poses" && s.compositeUrl);
  const threeDSheet = sheets.find(s => s.type === "3d_360" && s.compositeUrl);

  if (posesSheet?.compositeUrl) {
    const part = await downloadImageAsInlinePart(posesSheet.compositeUrl);
    if (part) {
      imageParts.push(part);
      context += `\nCHARACTER SHEET (POSES): Attached as image — 3x3 grid showing this person in 9 different poses and backgrounds. Use this to accurately describe their appearance, clothing style, posture, and energy in every cut.`;
    }
  }

  if (threeDSheet?.compositeUrl) {
    const part = await downloadImageAsInlinePart(threeDSheet.compositeUrl);
    if (part) {
      imageParts.push(part);
      context += `\nCHARACTER SHEET (360°): Attached as image — 3x3 grid showing this person from every angle (front, sides, back, top). Use this to accurately describe how they look from any camera angle.`;
    }
  }

  if (imageParts.length === 0 && sheets.length > 0) {
    context += `\nCHARACTER SHEET: Available but images could not be loaded — rely on the text description above.`;
  }

  console.log(`[prompt-engine] Character context: ${imageParts.length} reference image(s) attached for user ${userId}`);

  return { text: context, imageParts };
}

// ─── Model-Specific Instructions ────────────────────────────────

function getModelInstructions(model: string): string {
  switch (model) {
    case "minimax_video":
    case "minimax_hailuo":
    case "sora_2":
      return `TARGET MODEL: Minimax Video (Hailuo)
Minimax excels at: natural motion, great lip sync, talking head content, smooth camera work.
Write prompts with: natural speech patterns, character consistency, conversational energy.
Minimax handles up to 6 seconds per generation. Keep prompts focused on one action/beat per clip.`;

    case "wan_2.1":
      return `TARGET MODEL: Wan 2.1
Wan excels at: strong character consistency, open-source flexibility, creative control.
Write prompts with: detailed character descriptions, specific actions, environmental context.
Wan works best at 480p resolution with clear, specific prompts.`;

    case "ltx":
    case "ltx_fast":
      return `TARGET MODEL: LTX 2.3
LTX excels at: fast generation, rapid iteration, good for testing prompt ideas quickly.
Write prompts with: clear scene description, simple actions, good for b-roll and atmospheric shots.
LTX is fastest — use for testing, then switch to Kling/Minimax for final output.`;

    case "seedance_2.0":
    case "kling_2.6":
    default:
      return `TARGET MODEL: Kling 2.6 Pro
Kling excels at: hyper-realistic output, professional talking heads, testimonials, lip sync.
Write prompts with: professional lighting, clear facial expressions, steady camera, professional environments.
Kling handles longer clips (up to 10 seconds) well. Best quality model available.`;
  }
}

// ─── Main Engine ────────────────────────────────────────────────

export async function expandPrompt(input: PromptEngineInput): Promise<PromptEngineOutput> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    // Fallback: return a basic expansion without Gemini
    return {
      expandedPrompt: input.userRequest,
      script: input.userRequest,
      title: input.userRequest.length > 80 ? input.userRequest.substring(0, 77) + "..." : input.userRequest,
      estimatedDuration: input.duration || 8,
    };
  }

  const { text: characterContext, imageParts } = await getCharacterContext(input.userId);
  const modelInstructions = getModelInstructions(input.model);
  const format = input.format || "9:16";
  const duration = input.duration || 8;

  // Get custom system prompt from admin config (if edited)
  const customSystemAdditions = await getConfig("prompt_video_default", "");

  const userMessage = `${modelInstructions}

CHARACTER CONTEXT:${characterContext || "\nNo character details available — create a generic professional character."}

VIDEO REQUEST: "${input.userRequest}"
FORMAT: ${format} vertical
TARGET DURATION: ${duration} seconds
INDUSTRY: ${input.industry || "general"}

${customSystemAdditions ? `ADDITIONAL INSTRUCTIONS FROM ADMIN:\n${customSystemAdditions}` : ""}

Generate the full production prompt now. Return valid JSON only.`;

  try {
    // Build multimodal parts: text prompt + character sheet images (if available)
    const parts: Array<{ text: string } | GeminiInlinePart> = [
      { text: SYSTEM_PROMPT + "\n\n" + userMessage },
      ...imageParts,
    ];

    const response = await fetch(
      `${GOOGLE_AI_STUDIO_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts },
          ],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("[prompt-engine] Gemini error:", err);
      // Fallback
      return {
        expandedPrompt: input.userRequest,
        script: input.userRequest,
        title: input.userRequest.substring(0, 80),
        estimatedDuration: duration,
      };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return {
        expandedPrompt: input.userRequest,
        script: input.userRequest,
        title: input.userRequest.substring(0, 80),
        estimatedDuration: duration,
      };
    }

    // Parse the JSON response
    const parsed = JSON.parse(text);
    return {
      expandedPrompt: parsed.expandedPrompt || input.userRequest,
      script: parsed.script || parsed.expandedPrompt || input.userRequest,
      title: parsed.title || input.userRequest.substring(0, 80),
      estimatedDuration: parsed.estimatedDuration || duration,
    };
  } catch (err) {
    console.error("[prompt-engine] Error:", err);
    return {
      expandedPrompt: input.userRequest,
      script: input.userRequest,
      title: input.userRequest.substring(0, 80),
      estimatedDuration: duration,
    };
  }
}
