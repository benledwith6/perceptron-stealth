import prisma from "./prisma";

// In-memory cache with TTL
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds
const MAX_CACHE_SIZE = 200;

/**
 * Evict expired entries from the cache to prevent unbounded memory growth.
 */
function evictExpiredCacheEntries(): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) {
      cache.delete(k);
    }
  }
}

/**
 * Get a system config value by key.
 * Uses a 30-second in-memory cache to avoid DB hits on every request.
 * Returns the default if the key doesn't exist.
 */
export async function getConfig(key: string, defaultValue: string = ""): Promise<string> {
  // Check cache first
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Remove expired entry if TTL has passed
  if (cached) {
    cache.delete(key);
  }

  const row = await prisma.systemConfig.findUnique({ where: { key } });
  const value = row?.value ?? defaultValue;

  // Prevent unbounded cache growth
  if (cache.size >= MAX_CACHE_SIZE) {
    evictExpiredCacheEntries();
    // If still at capacity after eviction, clear oldest entries
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
  }

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Get a config value parsed as JSON.
 */
export async function getConfigJSON<T>(key: string, defaultValue: T): Promise<T> {
  const raw = await getConfig(key, "");
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a system config value (creates if it doesn't exist). Updates the cache.
 */
export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  // Update cache immediately instead of just deleting
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Get all configs, optionally filtered by category.
 */
export async function getAllConfigs(category?: string) {
  const where = category ? { category } : {};
  return prisma.systemConfig.findMany({
    where,
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });
}

/**
 * Clear the entire cache (useful after bulk updates).
 */
export function clearConfigCache(): void {
  cache.clear();
}

// ─── Default Config Values ──────────────────────────────────────

export const DEFAULT_CONFIGS = [
  {
    key: "onboarding_video_model",
    value: "kling_2.6",
    label: "Onboarding Video Model",
    category: "models",
  },
  {
    key: "generate_default_model",
    value: "kling_2.6",
    label: "Default Generation Model",
    category: "models",
  },
  {
    key: "character_sheet_model",
    value: "nano_banana",
    label: "Character Sheet Image Model",
    category: "models",
  },
  {
    key: "prompt_character_sheet_poses",
    value: "Generate a 3x3 character sheet of this person in 9 different professional poses. Use the reference photos to match their exact appearance, skin tone, hair, facial features, and body type. Poses should include: confident standing, sitting professional, gesturing while speaking, arms crossed, looking to the side, walking, leaning casually, pointing forward, and a close-up headshot. Professional studio lighting, clean background.",
    label: "Character Sheet (Poses) Prompt",
    category: "prompts",
  },
  {
    key: "prompt_character_sheet_3d",
    value: "Generate a 360-degree character reference of this person showing 9 angles: front facing, 45 degrees right, right profile, 135 degrees right (back-right), back of head, 135 degrees left (back-left), left profile, 45 degrees left, and top-down view. Match exact appearance from reference photos including hair part, hairline, ear shape, and clothing. Neutral expression, consistent lighting across all angles.",
    label: "Character Sheet (360°) Prompt",
    category: "prompts",
  },
  {
    key: "prompt_onboarding_video",
    value: "Create a 3-second professional video of this person speaking confidently to camera. Natural movement, professional lighting, slight head movement and blinking. The person should look directly at the camera with a warm, approachable expression. Clean, modern background.",
    label: "Onboarding Video Prompt",
    category: "prompts",
  },
  {
    key: "prompt_video_default",
    value: "Create a professional social media video featuring this person. Natural movement, good lighting, engaging camera presence. Match the person's appearance exactly from the reference images.",
    label: "Default Video Generation Prompt",
    category: "prompts",
  },
  {
    key: "onboarding_industries",
    value: JSON.stringify(["Real Estate", "Legal", "Medical", "Creator", "Business", "Other"]),
    label: "Industry Options",
    category: "onboarding",
  },
  {
    key: "onboarding_backgrounds",
    value: JSON.stringify(["office", "outdoor", "studio", "minimal", "urban", "nature"]),
    label: "Character Sheet Backgrounds",
    category: "onboarding",
  },
];

/**
 * Seed default configs. Only creates rows that don't already exist.
 */
export async function seedDefaultConfigs(): Promise<number> {
  let created = 0;
  for (const config of DEFAULT_CONFIGS) {
    const existing = await prisma.systemConfig.findUnique({ where: { key: config.key } });
    if (!existing) {
      await prisma.systemConfig.create({ data: config });
      created++;
    }
  }
  return created;
}
