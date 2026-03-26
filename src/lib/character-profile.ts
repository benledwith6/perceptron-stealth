/**
 * Character Profile — Detailed Feature Extraction
 *
 * From the course (Lesson 10):
 *   "True consistency means detailing every nuance:
 *    same eye shape, color, spacing. Same nose structure.
 *    Same jawline. Same lip fullness. Same skin tone.
 *    Same subtle features (freckles, smile lines).
 *    When you nail this, less than 1% will know they're not real."
 *
 * This module uses Gemini to analyze user photos and extract a
 * detailed character description that gets injected into EVERY
 * video generation prompt automatically. This is how we maintain
 * consistency across 50+ videos with the same "creator."
 */

import prisma from "./prisma";

const GOOGLE_AI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// ─── Types ──────────────────────────────────────────────────────

export interface CharacterProfile {
  rawDescription: string;       // full text description for prompt injection
  features: {
    face: string;               // face shape, jawline, contours
    eyes: string;               // eye shape, color, spacing, brow shape
    nose: string;               // nose structure, proportions
    mouth: string;              // lip fullness, mouth width, smile
    skin: string;               // tone, texture, freckles, marks
    hair: string;               // color, style, length, part, hairline
    body: string;               // build, height impression, posture
    age: string;                // apparent age range
    distinctiveFeatures: string; // anything unique — scars, dimples, glasses
  };
}

// ─── Extraction ─────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a casting director writing a detailed character reference sheet. Analyze these photos of the SAME person and extract an extremely detailed physical description.

Your description will be used to maintain PERFECT consistency across 50+ AI-generated videos of this person. Every detail matters — if you miss something, the videos will look like different people.

Extract and describe with EXTREME specificity:

1. FACE SHAPE & STRUCTURE: Oval/round/square/heart? Jawline — sharp, soft, defined? Cheekbone prominence? Chin shape?

2. EYES: Shape (almond, round, hooded, deep-set)? Color (exact shade)? Spacing (close-set, wide-set)? Eyelash visibility? Brow shape (arched, straight, thick, thin)? Brow color?

3. NOSE: Size relative to face? Bridge width? Tip shape (rounded, pointed, upturned)? Nostril size/shape?

4. MOUTH & LIPS: Upper lip vs lower lip fullness? Mouth width? Natural lip color? Teeth visibility when smiling? Smile type (wide, subtle, asymmetric)?

5. SKIN: Exact tone (very fair, fair, light olive, olive, tan, brown, dark brown, deep)? Texture (smooth, slight texture, visible pores)? Any marks — freckles, moles, acne scars, wrinkles, crow's feet, smile lines, forehead lines?

6. HAIR: Exact color (not just "brown" — ash brown, warm chestnut, dark brown with highlights)? Texture (straight, wavy, curly, coily)? Length? Style? Part direction? Hairline shape? Any thinning?

7. BODY: Build (slim, average, athletic, stocky, heavyset)? Shoulder width? Neck length? Overall proportions?

8. AGE: Apparent age range (not exact — "early 30s", "mid 40s")?

9. DISTINCTIVE FEATURES: Anything that makes this person recognizable — dimples, beauty marks, facial hair pattern, glasses, earrings, specific smile quirk?

Return a JSON object with these exact fields:
{
  "rawDescription": "A complete 2-3 paragraph natural-language description that could be pasted directly into a video generation prompt to recreate this exact person",
  "features": {
    "face": "...",
    "eyes": "...",
    "nose": "...",
    "mouth": "...",
    "skin": "...",
    "hair": "...",
    "body": "...",
    "age": "...",
    "distinctiveFeatures": "..."
  }
}

Be SPECIFIC. "Brown hair" is wrong. "Warm chestnut brown, slightly wavy, swept to the right with a natural side part, length just past the ears, slightly thinning at the temples" is right.`;

/**
 * Analyze user photos and extract a detailed character profile.
 * This profile gets stored and injected into every prompt.
 */
export async function extractCharacterProfile(
  userId: string
): Promise<CharacterProfile | null> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) return null;

  // Get user photos
  const photos = await prisma.photo.findMany({
    where: { userId },
    orderBy: { isPrimary: "desc" },
    take: 5,
  });

  if (photos.length === 0) return null;

  // Also get character sheet if available
  const sheet = await prisma.characterSheet.findFirst({
    where: { userId, status: "complete" },
    orderBy: { createdAt: "desc" },
  });

  // Build parts with images
  const parts: any[] = [{ text: EXTRACTION_PROMPT }];

  for (const photo of photos) {
    if (photo.url && !photo.url.startsWith("/uploads/")) {
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
        }
      } catch {}
    }
  }

  // Add character sheet composite if available (handles both data URIs and Supabase URLs)
  if (sheet?.compositeUrl) {
    if (sheet.compositeUrl.startsWith("data:")) {
      const match = sheet.compositeUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    } else if (sheet.compositeUrl.startsWith("http")) {
      try {
        const res = await fetch(sheet.compositeUrl);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          parts.push({
            inlineData: {
              mimeType: res.headers.get("content-type") || "image/png",
              data: Buffer.from(buffer).toString("base64"),
            },
          });
        }
      } catch {}
    }
  }

  if (parts.length < 2) return null; // no images loaded

  try {
    const response = await fetch(
      `${GOOGLE_AI_STUDIO_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.3, // low temp for factual description
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("[character-profile] Gemini error:", await response.text());
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text);

    // Store the profile in the database (using BrandProfile's guidelines field for now)
    await prisma.brandProfile.upsert({
      where: { userId },
      create: {
        userId,
        guidelines: JSON.stringify(parsed),
      },
      update: {
        guidelines: JSON.stringify(parsed),
      },
    });

    return parsed as CharacterProfile;
  } catch (err) {
    console.error("[character-profile] Error:", err);
    return null;
  }
}

/**
 * Get the stored character profile for a user.
 * Returns the rawDescription ready for prompt injection.
 */
export async function getCharacterDescription(userId: string): Promise<string> {
  const brand = await prisma.brandProfile.findFirst({ where: { userId } });
  if (!brand?.guidelines) return "";

  try {
    const profile = JSON.parse(brand.guidelines) as CharacterProfile;
    return profile.rawDescription || "";
  } catch {
    return "";
  }
}
