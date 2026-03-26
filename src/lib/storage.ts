// Supabase Storage layer
// Uses the officialai-media bucket for all file storage

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const BUCKET = "officialai-media";

// ---------------------------------------------------------------------------
// Allowed MIME types and extensions
// ---------------------------------------------------------------------------

const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/mp4": [".m4a"],
  "audio/ogg": [".ogg"],
  "audio/webm": [".webm"],
};

/** Maximum file size: 500 MB */
const MAX_FILE_SIZE = 500 * 1024 * 1024;

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function isStorageConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Sanitize a storage key to prevent path traversal attacks.
 * Rejects keys with "..", leading slashes, or null bytes.
 */
function sanitizeKey(key: string): string {
  if (!key || key.includes("\0")) {
    throw new Error("Invalid storage key");
  }
  // Normalize and reject path traversal
  const normalized = key.replace(/\\/g, "/");
  if (normalized.includes("..") || normalized.startsWith("/")) {
    throw new Error("Invalid storage key: path traversal detected");
  }
  return normalized;
}

/**
 * Validate that a content type is in the allowlist.
 */
function validateContentType(contentType: string): void {
  if (!ALLOWED_CONTENT_TYPES[contentType]) {
    throw new Error(
      `Unsupported content type: ${contentType}. Allowed: ${Object.keys(ALLOWED_CONTENT_TYPES).join(", ")}`
    );
  }
}

/**
 * Upload a file buffer to Supabase Storage and return its public URL.
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const safeKey = sanitizeKey(key);
  validateContentType(contentType);

  if (buffer.length === 0) {
    throw new Error("Cannot upload empty file");
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(
      `File size ${(buffer.length / (1024 * 1024)).toFixed(1)}MB exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
    );
  }

  const client = getClient();

  const { error } = await client.storage
    .from(BUCKET)
    .upload(safeKey, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  // Return the public URL (bucket is public)
  const { data } = client.storage.from(BUCKET).getPublicUrl(safeKey);
  return data.publicUrl;
}

/**
 * Get the public URL for a stored file.
 */
export function getPublicUrl(key: string): string {
  const safeKey = sanitizeKey(key);
  const client = getClient();
  const { data } = client.storage.from(BUCKET).getPublicUrl(safeKey);
  return data.publicUrl;
}

/**
 * Generate a signed download URL valid for the given duration.
 */
export async function getSignedUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const safeKey = sanitizeKey(key);
  if (expiresIn < 1 || expiresIn > 604800) {
    throw new Error("expiresIn must be between 1 and 604800 seconds (7 days)");
  }
  const client = getClient();
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(safeKey, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message}`);
  }
  return data.signedUrl;
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(key: string): Promise<void> {
  const safeKey = sanitizeKey(key);
  const client = getClient();
  const { error } = await client.storage.from(BUCKET).remove([safeKey]);
  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Allowed hosts for external downloads (SSRF protection).
 * Add AI provider domains as needed.
 */
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "replicate.delivery",
  "pbxt.replicate.delivery",
  "storage.googleapis.com",
  "oaidalleapiprodscus.blob.core.windows.net",
  "v3b.fal.media",
  "fal.media",
  "storage.fal.ai",
  "shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com",
  "shotstack-api-output.s3-ap-southeast-2.amazonaws.com",
]);

/**
 * Download a file from an external URL and upload it to storage.
 * Used for persisting AI-generated video/image results.
 *
 * Only allows downloads from known AI provider hosts to prevent SSRF.
 */
export async function downloadAndStore(
  sourceUrl: string,
  key: string,
  contentType = "video/mp4"
): Promise<string> {
  // Validate URL and prevent SSRF
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error(`Invalid source URL: ${sourceUrl}`);
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error(`Invalid protocol: ${parsed.protocol}. Only HTTP(S) allowed.`);
  }

  if (!ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Download from host "${parsed.hostname}" is not allowed. ` +
      `Allowed hosts: ${[...ALLOWED_DOWNLOAD_HOSTS].join(", ")}`
    );
  }

  const response = await fetch(sourceUrl, { redirect: "error" });
  if (!response.ok) {
    throw new Error(
      `Failed to download from ${sourceUrl}: ${response.status} ${response.statusText}`
    );
  }

  // Enforce size limit on downloads
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
    throw new Error(`Remote file exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return uploadFile(buffer, key, contentType);
}

// ---------------------------------------------------------------------------
// Key helpers — organise objects by type and user
// ---------------------------------------------------------------------------

export function photoKey(userId: string, fileId: string, ext: string): string {
  return `photos/${userId}/${fileId}.${ext}`;
}

export function voiceKey(userId: string, fileId: string, ext: string): string {
  return `voices/${userId}/${fileId}.${ext}`;
}

export function videoKey(userId: string, fileId: string, ext: string): string {
  return `videos/${userId}/${fileId}.${ext}`;
}

export function audioKey(userId: string, fileId: string, ext: string): string {
  return `audio/${userId}/${fileId}.${ext}`;
}

export function thumbnailKey(userId: string, fileId: string, ext: string): string {
  return `thumbnails/${userId}/${fileId}.${ext}`;
}
