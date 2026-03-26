const BASE_URL = "https://api.post-bridge.com/v1";

function getApiKey(): string {
  const key = process.env.POST_BRIDGE_API_KEY;
  if (!key) throw new Error("POST_BRIDGE_API_KEY is not set");
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

async function pbFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Post Bridge ${init?.method || "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

// ─── Types ──────────────────────────────────────────────────────

export interface PBAccount {
  id: number;
  platform: string;
  username: string;
}

export interface PBMediaUpload {
  media_id: string;
  upload_url: string;
  name: string;
}

export interface PBPost {
  id: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PBPostResult {
  id: number;
  post_id: number;
  success: boolean;
  social_account_id: number;
  error: string | null;
  platform_data: {
    id?: string;
    url?: string;
    username?: string;
  } | null;
}

export interface CreatePostOptions {
  caption: string;
  socialAccountIds: number[];
  mediaIds?: string[];
  mediaUrls?: string[];
  scheduledAt?: string | null;
  platformConfigs?: Record<string, any>;
}

// ─── API Methods ────────────────────────────────────────────────

/**
 * List all social accounts connected in Post Bridge.
 * Optionally filter by platform.
 */
export async function getAccounts(platforms?: string[]): Promise<PBAccount[]> {
  const params = new URLSearchParams();
  if (platforms) {
    for (const p of platforms) params.append("platform[]", p);
  }
  const query = params.toString();
  const data = await pbFetch(`/social-accounts${query ? `?${query}` : ""}`);
  return data.data ?? data;
}

/**
 * Upload a video to Post Bridge by providing its URL.
 * 1. Create a signed upload URL
 * 2. Download the video from our storage
 * 3. PUT it to the signed URL
 * Returns the media_id for use in createPost.
 */
export async function uploadMedia(
  videoUrl: string,
  filename: string = "video.mp4"
): Promise<string> {
  // Step 1: Get the video size via HEAD request
  let sizeBytes = 0;
  try {
    const headRes = await fetch(videoUrl, { method: "HEAD" });
    if (headRes.ok) {
      sizeBytes = parseInt(headRes.headers.get("content-length") || "0", 10);
    }
  } catch {
    // HEAD failed — we'll use the fallback size below
  }

  // Step 2: Create upload URL
  const upload: PBMediaUpload = await pbFetch("/media/create-upload-url", {
    method: "POST",
    body: JSON.stringify({
      name: filename,
      mime_type: "video/mp4",
      size_bytes: sizeBytes || 10_000_000, // fallback if HEAD doesn't return size
    }),
  });

  // Step 3: Download the video
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to download video from ${videoUrl}: ${videoRes.status}`);
  }
  const videoBuffer = await videoRes.arrayBuffer();

  // Step 4: Upload to Post Bridge signed URL
  const putRes = await fetch(upload.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: videoBuffer,
  });
  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`Failed to upload video to Post Bridge: ${putRes.status} ${err}`);
  }

  return upload.media_id;
}

/**
 * Create a post on Post Bridge.
 * If scheduledAt is provided, the post will be scheduled.
 * If null/omitted, it publishes immediately.
 */
export async function createPost(options: CreatePostOptions): Promise<PBPost> {
  const body: Record<string, any> = {
    caption: options.caption,
    social_accounts: options.socialAccountIds,
    use_queue: true,
  };

  if (options.mediaIds?.length) {
    body.media = options.mediaIds;
  } else if (options.mediaUrls?.length) {
    body.media_urls = options.mediaUrls;
  }

  if (options.scheduledAt) {
    body.scheduled_at = options.scheduledAt;
  }

  if (options.platformConfigs) {
    body.platform_configurations = options.platformConfigs;
  }

  return pbFetch("/posts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Get publish results for a specific post.
 */
export async function getPostResults(postId: number): Promise<PBPostResult[]> {
  const data = await pbFetch(`/post-results?post_id[]=${postId}`);
  return data.data ?? data;
}

/**
 * Get a single post by ID.
 */
export async function getPost(postId: number): Promise<PBPost> {
  return pbFetch(`/posts/${postId}`);
}

/**
 * Delete a scheduled/draft post.
 */
export async function deletePost(postId: number): Promise<void> {
  await pbFetch(`/posts/${postId}`, { method: "DELETE" });
}
