import { z } from "zod";

// ─── Auth Schemas ────────────────────────────────────────────────

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or less")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100, "First name must be 100 characters or less")
    .regex(/^[^<>&"']*$/, "First name contains invalid characters"),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(100, "Last name must be 100 characters or less")
    .regex(/^[^<>&"']*$/, "Last name contains invalid characters"),
  industry: z.string().trim().max(100).optional(),
  company: z.string().trim().max(200, "Company name must be 200 characters or less").optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

// ─── Video Schemas ───────────────────────────────────────────────

export const videoCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less"),
  description: z.string().trim().max(2000, "Description must be 2000 characters or less").optional(),
  script: z.string().trim().max(5000, "Script must be 5000 characters or less").optional(),
  model: z.string().max(50).optional().default("kling_2.6"),
  contentType: z.string().max(50).optional().default("general"),
  sourceReview: z.string().max(5000).optional(),
  photoId: z.string().uuid("Invalid photo ID").optional(),
  voiceId: z.string().uuid("Invalid voice ID").optional(),
});

export type VideoCreateInput = z.infer<typeof videoCreateSchema>;

export const videoUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  script: z.string().max(5000).optional(),
  model: z.string().max(50).optional(),
  contentType: z.string().max(50).optional(),
  sourceReview: z.string().max(5000).optional(),
  status: z
    .enum(["draft", "generating", "review", "approved", "published", "rejected", "failed"])
    .optional(),
  photoId: z.string().uuid().optional(),
  voiceId: z.string().uuid().optional(),
});

export type VideoUpdateInput = z.infer<typeof videoUpdateSchema>;

// ─── Photo Schemas ───────────────────────────────────────────────

export const photoUploadSchema = z.object({
  filename: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename must be 255 characters or less")
    .regex(
      /\.(jpg|jpeg|png|webp|heic)$/i,
      "File must be an image (jpg, jpeg, png, webp, or heic)"
    ),
  url: z.string().url("Invalid URL"),
  isPrimary: z.boolean().optional().default(false),
});

export type PhotoUploadInput = z.infer<typeof photoUploadSchema>;

// ─── Voice Sample Schemas ────────────────────────────────────────

export const voiceSampleSchema = z.object({
  filename: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename must be 255 characters or less")
    .regex(
      /\.(mp3|wav|m4a|ogg|webm)$/i,
      "File must be an audio file (mp3, wav, m4a, ogg, or webm)"
    ),
  url: z.string().url("Invalid URL"),
  duration: z
    .number()
    .min(0, "Duration cannot be negative")
    .max(600, "Duration must be 10 minutes or less")
    .optional(),
  isDefault: z.boolean().optional().default(false),
});

export type VoiceSampleInput = z.infer<typeof voiceSampleSchema>;

// ─── Schedule Schemas ────────────────────────────────────────────

export const scheduleCreateSchema = z.object({
  videoId: z.string().uuid("Invalid video ID"),
  platform: z.enum(["youtube", "tiktok", "instagram", "linkedin", "twitter", "facebook"], {
    message: "Platform must be one of: youtube, tiktok, instagram, linkedin, twitter, facebook",
  }),
  scheduledAt: z
    .string()
    .datetime({ message: "scheduledAt must be a valid ISO 8601 datetime" })
    .refine(
      (val) => new Date(val) > new Date(),
      "Scheduled time must be in the future"
    ),
});

export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;

// ─── Brand Profile Schemas ───────────────────────────────────────

export const brandProfileSchema = z.object({
  brandName: z.string().max(200, "Brand name must be 200 characters or less").optional(),
  tagline: z.string().max(500, "Tagline must be 500 characters or less").optional(),
  toneOfVoice: z
    .enum(["professional", "casual", "friendly", "authoritative", "playful", "inspirational"])
    .optional(),
  targetAudience: z
    .string()
    .max(1000, "Target audience must be 1000 characters or less")
    .optional(),
  competitors: z
    .string()
    .max(1000, "Competitors must be 1000 characters or less")
    .optional(),
  brandColors: z
    .string()
    .max(500, "Brand colors must be 500 characters or less")
    .optional(),
  guidelines: z
    .string()
    .max(5000, "Guidelines must be 5000 characters or less")
    .optional(),
});

export type BrandProfileInput = z.infer<typeof brandProfileSchema>;

// ─── Generate Schemas ────────────────────────────────────────────

export const generateRequestSchema = z.object({
  videoId: z.string().uuid("Invalid video ID").optional(),
  model: z.string().optional(),
  script: z
    .string()
    .min(1, "Script is required")
    .max(5000, "Script must be 5000 characters or less")
    .optional(),
  format: z.enum([
    "talking_head_15", "testimonial_15", "educational_30", "quick_tip_8",
  ]).optional(),
  photoId: z.string().uuid("Invalid photo ID").optional(),
  voiceId: z.string().uuid("Invalid voice ID").optional(),
});

export type GenerateRequestInput = z.infer<typeof generateRequestSchema>;

// ─── Publish Schemas ────────────────────────────────────────────

export const publishSchema = z.object({
  videoId: z.string().uuid("Invalid video ID"),
  platforms: z
    .array(
      z.enum([
        "youtube", "tiktok", "instagram", "linkedin",
        "facebook", "twitter", "threads", "bluesky", "pinterest",
      ])
    )
    .min(1, "At least one platform is required"),
  scheduledAt: z
    .string()
    .datetime({ message: "scheduledAt must be a valid ISO 8601 datetime" })
    .optional(),
  caption: z.string().max(5000, "Caption must be 5000 characters or less").optional(),
});

export type PublishInput = z.infer<typeof publishSchema>;
