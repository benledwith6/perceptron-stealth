import prisma from "./prisma";
import { getConfig } from "./system-config";
import { uploadFile, isStorageConfigured } from "./storage";
import { getBackgroundsForIndustry } from "./character-sheet";

const GOOGLE_AI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// ---------------------------------------------------------------------------
// Welcome-video scene (shared between starting-frame gen and Kling prompt)
// ---------------------------------------------------------------------------
//
// Pure scene description — no motion, no dialogue. The starting frame bakes
// this in visually; the Kling prompt re-states it to prevent drift across
// the 5-second generation.
export const WELCOME_SCENE =
  "Dark charcoal suit with natural fabric drape and slight sitting wrinkles. " +
  "White dress shirt with a collar crease. Real working office background — " +
  "laptop, coffee cup, papers on the desk. Large window to the left casting " +
  "natural daylight. Overhead fluorescent-LED office panels visible. Shallow " +
  "phone-camera depth of field, background 4-6 feet behind subject. Mixed " +
  "lighting: cool overhead LEDs + warm natural window light from the left. " +
  "Phone AWB creates a neutral-warm cast. Shadows present under chin and " +
  "jawline — unfilled. Single catch light in each eye from the window.";

/**
 * Starting Frame Generator
 *
 * The starting frame is the anchor image used for EVERY video generation.
 * It ensures character consistency across all clips. From the course:
 * "You'll use this same starting frame for every segment."
 *
 * This generates a high-quality starting frame using Nano Banana Pro,
 * with the character in their specific pose/setting/lighting ready
 * for video generation.
 *
 * IDENTIFICATION: Starting frame photos are stored in the Photo table with
 * a filename prefix of "sf--". This prefix is used by getStartingFrameUrl()
 * to retrieve them. The prefix is intentionally distinct from any user-
 * uploaded filename to avoid false matches.
 */

/** Filename prefix used to tag Photo records that are starting frames. */
const SF_FILENAME_PREFIX = "sf--";

export interface StartingFrameResult {
  imageUrl: string | null;
  photoId: string | null;
  status: "complete" | "failed" | "demo";
}

// ---------------------------------------------------------------------------
// Retrieval — used by the video generation pipeline
// ---------------------------------------------------------------------------

/**
 * Get the most recent starting frame URL for a user.
 *
 * This is the function that the video generation pipeline should call
 * before every cut to get the anchor image for character consistency.
 *
 * Returns the Supabase Storage URL (permanent) if available, or null
 * if no starting frame has been generated yet.
 */
export async function getStartingFrameUrl(userId: string): Promise<string | null> {
  const sfPhoto = await prisma.photo.findFirst({
    where: {
      userId,
      filename: { startsWith: SF_FILENAME_PREFIX },
    },
    orderBy: { createdAt: "desc" },
    select: { url: true },
  });

  if (!sfPhoto?.url) return null;

  // Reject data: URIs — they are ephemeral and cannot be passed to FAL
  if (sfPhoto.url.startsWith("data:")) {
    console.warn("[starting-frame] Found starting frame but it is a data URI (not permanent). Returning null.");
    return null;
  }

  return sfPhoto.url;
}

/**
 * Get or generate a starting frame for a user.
 *
 * Checks for an existing starting frame first. If none exists (or the
 * existing one is a data URI), generates a new one.
 *
 * This is the safe entry point for the video generation pipeline --
 * it will never throw. On failure it returns null so the caller can
 * fall back to the user's primary photo.
 */
export async function getOrGenerateStartingFrame(userId: string): Promise<string | null> {
  try {
    // Check for existing starting frame
    const existing = await getStartingFrameUrl(userId);
    if (existing) return existing;

    // None found — generate one
    const result = await generateStartingFrame(userId);
    if (result.status === "complete" && result.imageUrl && !result.imageUrl.startsWith("data:")) {
      return result.imageUrl;
    }

    return null;
  } catch (err) {
    console.error("[starting-frame] getOrGenerateStartingFrame failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Generate a starting frame for video generation.
 * Takes the user's character sheet + a scene description and creates
 * an anchor image that will be attached to every video generation call.
 */
export async function generateStartingFrame(
  userId: string,
  sceneDescription?: string
): Promise<StartingFrameResult> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    console.warn("[starting-frame] GOOGLE_AI_STUDIO_KEY not set, returning demo status");
    return { imageUrl: null, photoId: null, status: "demo" };
  }

  // Get user's uploaded photos for reference (exclude previous starting frames)
  const photos = await prisma.photo.findMany({
    where: {
      userId,
      NOT: { filename: { startsWith: SF_FILENAME_PREFIX } },
    },
    orderBy: { isPrimary: "desc" },
    take: 3,
  });

  if (photos.length === 0) {
    console.error("[starting-frame] No user photos found for userId:", userId);
    return { imageUrl: null, photoId: null, status: "failed" };
  }

  // Get character sheet for additional reference
  const characterSheet = await prisma.characterSheet.findFirst({
    where: { userId, status: "complete" },
    include: { images: true },
    orderBy: { createdAt: "desc" },
  });

  // Get brand context for appropriate setting
  const brand = await prisma.brandProfile.findFirst({ where: { userId } });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { industry: true, firstName: true },
  });

  // Use industry-specific backgrounds (same presets as character sheet)
  const industry = user?.industry || "other";
  const backgrounds = getBackgroundsForIndustry(industry);
  // Pick the first background as default for the starting frame
  const defaultBackground = backgrounds[0];
  const scene = sceneDescription || defaultBackground;

  const prompt = `Generate a single photograph of this EXACT person as a video starting frame. Match every detail from the reference photos — face, skin, hair, build, all distinguishing features.

Shot on iPhone 15 Pro Max, 24mm lens, f/1.78 aperture. Medium close-up from chest up. Natural light from a window, no flash, no studio lighting.

SCENE: ${scene}
The environment should feel lived-in and real — not staged or sterile.

PERSON: Facing camera, natural confident expression, slight smile, direct eye contact. Casual relaxed pose, hands visible and relaxed. Subtle breathing posture — not stiff, not posed.${brand?.toneOfVoice ? ` Energy: ${brand.toneOfVoice}.` : ""}

Clothing: casual and real — whatever fits the setting, not business formal.
Skin: real texture, visible pores, natural imperfections. No airbrushing, no glossy AI sheen.
Background: slight depth of field blur, but the setting is clearly recognizable.

No morphing, no extra fingers, no uncanny valley. This must look like a real iPhone photo taken by a real person in a real place. This frame anchors character consistency across all video generations.`;

  // Build parts with reference images
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: prompt }];

  // Track how many reference images we actually attached
  let refImageCount = 0;

  // Add user photos as inline base64 reference
  for (const photo of photos) {
    if (!photo.url || photo.url.startsWith("/uploads/")) continue;
    try {
      const res = await fetch(photo.url);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        parts.push({
          inlineData: {
            mimeType: res.headers.get("content-type") || "image/jpeg",
            data: Buffer.from(buffer).toString("base64"),
          },
        });
        refImageCount++;
      } else {
        console.warn(`[starting-frame] Failed to fetch photo ${photo.id}: ${res.status}`);
      }
    } catch (err) {
      console.warn(`[starting-frame] Error fetching photo ${photo.id}:`, err);
    }
  }

  // Add character sheet composite as additional reference
  if (characterSheet?.compositeUrl) {
    const csUrl = characterSheet.compositeUrl;
    if (csUrl.startsWith("data:")) {
      // Data URL — extract inline
      const match = csUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        refImageCount++;
      }
    } else if (csUrl.startsWith("http")) {
      // Supabase URL — download and inline
      try {
        const res = await fetch(csUrl);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          parts.push({
            inlineData: {
              mimeType: res.headers.get("content-type") || "image/png",
              data: Buffer.from(buffer).toString("base64"),
            },
          });
          refImageCount++;
        } else {
          console.warn(`[starting-frame] Failed to fetch character sheet: ${res.status}`);
        }
      } catch (err) {
        console.warn("[starting-frame] Error fetching character sheet:", err);
      }
    }
  }

  if (refImageCount === 0) {
    console.error("[starting-frame] No reference images could be fetched. Cannot generate.");
    return { imageUrl: null, photoId: null, status: "failed" };
  }

  console.log(`[starting-frame] Generating with ${refImageCount} reference image(s) for user ${userId}`);

  try {
    // Use the same model config as character-sheet.ts
    const model = await getConfig("character_sheet_model", "nano_banana");
    const MODEL_MAP: Record<string, string> = {
      nano_banana: "nano-banana-pro-preview",
      gemini_image: "gemini-2.5-flash-image",
      gemini_3_image: "gemini-3-pro-image-preview",
      gemini_3_1_image: "gemini-3.1-flash-image-preview",
    };
    const modelName = MODEL_MAP[model] || "nano-banana-pro-preview";

    const response = await fetch(
      `${GOOGLE_AI_STUDIO_URL}/${modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["image", "text"],
            temperature: 0.6,
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[starting-frame] ${modelName} API error (${response.status}):`, errBody);
      return { imageUrl: null, photoId: null, status: "failed" };
    }

    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);

    if (!imagePart?.inlineData) {
      console.error("[starting-frame] Gemini response contained no image data");
      return { imageUrl: null, photoId: null, status: "failed" };
    }

    const { mimeType, data: base64Data } = imagePart.inlineData;
    let imageUrl: string;

    // Upload to Supabase Storage (permanent URL required for FAL)
    if (isStorageConfigured()) {
      const buffer = Buffer.from(base64Data, "base64");
      const ext = mimeType.includes("png") ? "png" : "jpg";
      const storageKey = `starting-frames/${userId}/sf-${Date.now()}.${ext}`;
      try {
        imageUrl = await uploadFile(buffer, storageKey, mimeType);
      } catch (err) {
        console.error("[starting-frame] Supabase upload failed:", err);
        // Data URI fallback — will work for display but NOT for FAL image-to-video
        imageUrl = `data:${mimeType};base64,${base64Data}`;
      }
    } else {
      console.warn("[starting-frame] Storage not configured. Falling back to data URI (will not work with FAL).");
      imageUrl = `data:${mimeType};base64,${base64Data}`;
    }

    // Save as a photo record with the SF prefix so getStartingFrameUrl can find it
    const savedPhoto = await prisma.photo.create({
      data: {
        userId,
        filename: `${SF_FILENAME_PREFIX}${Date.now()}.${mimeType.includes("png") ? "png" : "jpg"}`,
        url: imageUrl,
        isPrimary: false,
      },
    });

    console.log(`[starting-frame] Generated successfully. Photo ID: ${savedPhoto.id}, URL is ${imageUrl.startsWith("data:") ? "data URI" : "Supabase URL"}`);

    return {
      imageUrl,
      photoId: savedPhoto.id,
      status: "complete",
    };
  } catch (err) {
    console.error("[starting-frame] Unexpected error during generation:", err);
    return { imageUrl: null, photoId: null, status: "failed" };
  }
}

// ---------------------------------------------------------------------------
// Welcome-video starting frame
// ---------------------------------------------------------------------------
//
// Purpose-built starting frame generator for the onboarding welcome video.
// Goals:
//   1. Identity — feed the user's raw photos directly so the face matches
//      (not just character-sheet interpretations).
//   2. Scene lock — hardcoded charcoal-suit / office / iPhone aesthetic so
//      the Kling video starts already in-scene (prevents the "two-scene
//      transition" glitch where Kling dissolves from the selfie's original
//      background into the prompted office).
//   3. Likeness model — uses Nano Banana Pro (same model the rest of the
//      codebase uses for starting frames). Stronger likeness than Gemini
//      2.5 Flash Image.
//
// Inputs sent to Nano Banana Pro:
//   - Up to 3 raw user photos (primary first)
//   - Poses character sheet
//   - 360 character sheet
//
// Failure policy: returns { status: "failed" } on any error. Caller treats
// this as fatal for the whole welcome-video request.

async function fetchAsInlineData(
  url: string,
  fallbackMime: string
): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[welcome-sf] Failed to fetch reference image: ${res.status} ${url}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    return {
      inlineData: {
        mimeType: res.headers.get("content-type") || fallbackMime,
        data: Buffer.from(buffer).toString("base64"),
      },
    };
  } catch (err) {
    console.warn("[welcome-sf] Error fetching reference image:", url, err);
    return null;
  }
}

export async function generateWelcomeStartingFrame(
  userId: string,
  refs: { posesSheetUrl: string; threeDSheetUrl: string }
): Promise<StartingFrameResult> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("[welcome-sf] No Google AI key set");
    return { imageUrl: null, photoId: null, status: "failed" };
  }

  if (!refs.posesSheetUrl || !refs.threeDSheetUrl) {
    console.error("[welcome-sf] Missing required character sheet URLs");
    return { imageUrl: null, photoId: null, status: "failed" };
  }

  // Pull up to 3 raw user photos, primary first. Exclude any prior
  // starting-frame photos (those have the sf-- prefix).
  const photos = await prisma.photo.findMany({
    where: {
      userId,
      NOT: { filename: { startsWith: SF_FILENAME_PREFIX } },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    take: 3,
  });

  if (photos.length === 0) {
    console.error("[welcome-sf] No user photos found for userId:", userId);
    return { imageUrl: null, photoId: null, status: "failed" };
  }

  const prompt =
    "Generate a single high-resolution still photograph of the EXACT same " +
    "person shown in the provided reference photos and character sheets. " +
    "Lock every facial feature: pore texture, asymmetry, skin unevenness, " +
    "lip shape, hairline, jawline, eye color, brow shape. No smoothing. " +
    "No symmetry correction. No AI sheen. Preserve all natural imperfections. " +
    "Zero face/neck skin tone mismatch. The raw selfie photos are the " +
    "ground truth for identity — match them precisely. " +
    "\n\n" +
    `SCENE: ${WELCOME_SCENE}\n\n` +
    "SUBJECT POSE: Facing the camera directly at eye level, chest-up framing, " +
    "medium close-up. NEUTRAL CLOSED-MOUTH EXPRESSION — lips relaxed and " +
    "gently closed (not pressed, not smiling, no teeth). Eyes locked on the " +
    "lens, alert and confident. Natural relaxed shoulders. Subtle breathing " +
    "posture. The subject is in the micro-moment just before they begin " +
    "speaking. " +
    "\n\n" +
    "CAMERA: Shot on iPhone 16 Pro or Samsung S25 Ultra at eye level, propped " +
    "or selfie-style. 26mm equivalent focal length. Slight barrel distortion " +
    "at edges. Real compression artifacts in background gradients. Subtle " +
    "chroma noise in shadows. 9:16 vertical aspect ratio. 1-2 degree frame " +
    "tilt — this is a real phone photo, not a tripod shot. " +
    "\n\n" +
    "SKIN: Real texture, visible pores, natural imperfections. Natural " +
    "fly-away hairs at temples. Individual strand detail at the hairline. " +
    "No airbrushing. " +
    "\n\n" +
    "AVOID: smooth skin, perfect symmetry, glassy eyes, helmet hair, wide " +
    "smile, visible teeth, studio lighting, ring light, softbox, " +
    "rendered-looking background, neck tone mismatch, closed eyes, looking " +
    "away from camera, dramatic pose, staged composition, film grain (phones " +
    "suppress it), generic model-face, airbrushed magazine look. " +
    "\n\n" +
    "This frame will anchor a talking-head video — it must look like a real " +
    "iPhone photo of a real person in a real working office, captured in the " +
    "half-second before they start speaking.";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: prompt }];
  let refCount = 0;

  // 1. Raw user photos first — identity ground truth
  for (const photo of photos) {
    if (!photo.url || photo.url.startsWith("/uploads/") || photo.url.startsWith("data:")) continue;
    const part = await fetchAsInlineData(photo.url, "image/jpeg");
    if (part) {
      parts.push(part);
      refCount++;
    }
  }

  // 2. Character sheets — multi-angle reinforcement
  const posesPart = await fetchAsInlineData(refs.posesSheetUrl, "image/png");
  if (posesPart) {
    parts.push(posesPart);
    refCount++;
  }
  const threeDPart = await fetchAsInlineData(refs.threeDSheetUrl, "image/png");
  if (threeDPart) {
    parts.push(threeDPart);
    refCount++;
  }

  if (refCount === 0) {
    console.error("[welcome-sf] Could not fetch any reference images");
    return { imageUrl: null, photoId: null, status: "failed" };
  }

  console.log(`[welcome-sf] Submitting to nano-banana-pro-preview with ${refCount} reference images (${photos.length} raw photos + 2 sheets)`);

  try {
    const response = await fetch(
      `${GOOGLE_AI_STUDIO_URL}/nano-banana-pro-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["image", "text"],
            temperature: 0.6,
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[welcome-sf] Nano Banana Pro error (${response.status}):`, errBody.substring(0, 500));
      return { imageUrl: null, photoId: null, status: "failed" };
    }

    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);

    if (!imagePart?.inlineData) {
      console.error("[welcome-sf] Response contained no image data");
      return { imageUrl: null, photoId: null, status: "failed" };
    }

    const { mimeType, data: base64Data } = imagePart.inlineData;

    if (!isStorageConfigured()) {
      console.error("[welcome-sf] Supabase storage not configured — cannot produce a FAL-compatible URL");
      return { imageUrl: null, photoId: null, status: "failed" };
    }

    const buffer = Buffer.from(base64Data, "base64");
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const ts = Date.now();
    const storageKey = `starting-frames/${userId}/sf-welcome-${ts}.${ext}`;

    let imageUrl: string;
    try {
      imageUrl = await uploadFile(buffer, storageKey, mimeType);
    } catch (err) {
      console.error("[welcome-sf] Supabase upload failed:", err);
      return { imageUrl: null, photoId: null, status: "failed" };
    }

    const savedPhoto = await prisma.photo.create({
      data: {
        userId,
        filename: `${SF_FILENAME_PREFIX}welcome-${ts}.${ext}`,
        url: imageUrl,
        isPrimary: false,
      },
    });

    console.log(`[welcome-sf] Generated ${storageKey} (photoId=${savedPhoto.id})`);

    return {
      imageUrl,
      photoId: savedPhoto.id,
      status: "complete",
    };
  } catch (err) {
    console.error("[welcome-sf] Unexpected error during generation:", err);
    return { imageUrl: null, photoId: null, status: "failed" };
  }
}
