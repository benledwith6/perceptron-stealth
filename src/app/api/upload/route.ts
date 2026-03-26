import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import prisma from "@/lib/prisma";
import {
  uploadFile,
  isStorageConfigured,
  photoKey,
  voiceKey,
  videoKey,
} from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// File type / size validation
// ---------------------------------------------------------------------------

type FileCategory = "photo" | "voice" | "video";

const ALLOWED_TYPES: Record<FileCategory, string[]> = {
  photo: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ],
  voice: [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/aac",
  ],
  video: [
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
  ],
};

const MAX_SIZE: Record<FileCategory, number> = {
  photo: 10 * 1024 * 1024, // 10 MB
  voice: 50 * 1024 * 1024, // 50 MB
  video: 500 * 1024 * 1024, // 500 MB
};

function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
  };
  return map[mime] || "bin";
}

// ---------------------------------------------------------------------------
// POST /api/upload
//
// Accepts multipart/form-data with:
//   - file: the file blob
//   - type: "photo" | "voice" | "video"
//
// Returns: { url, key, filename }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    if (!isStorageConfigured()) {
      return NextResponse.json(
        {
          error:
            "File storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.",
        },
        { status: 503 }
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart form data" },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    const category = (formData.get("type") as string) || "";

    if (!file) {
      return NextResponse.json(
        { error: 'Missing "file" field in form data' },
        { status: 400 }
      );
    }

    if (!["photo", "voice", "video"].includes(category)) {
      return NextResponse.json(
        { error: 'Invalid "type" — must be "photo", "voice", or "video"' },
        { status: 400 }
      );
    }

    const fileCategory = category as FileCategory;
    const contentType = file.type || "application/octet-stream";

    // Validate MIME type
    if (!ALLOWED_TYPES[fileCategory].includes(contentType)) {
      return NextResponse.json(
        {
          error: `File type "${contentType}" is not allowed for ${fileCategory} uploads. Allowed: ${ALLOWED_TYPES[fileCategory].join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_SIZE[fileCategory]) {
      const maxMB = MAX_SIZE[fileCategory] / (1024 * 1024);
      return NextResponse.json(
        {
          error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum for ${fileCategory}: ${maxMB} MB`,
        },
        { status: 400 }
      );
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Build the S3 key
    const fileId = uuidv4();
    const ext = extensionFromMime(contentType);
    let key: string;

    switch (fileCategory) {
      case "photo":
        key = photoKey(user.id, fileId, ext);
        break;
      case "voice":
        key = voiceKey(user.id, fileId, ext);
        break;
      case "video":
        key = videoKey(user.id, fileId, ext);
        break;
    }

    const url = await uploadFile(buffer, key, contentType);
    const filename = file.name || `${fileId}.${ext}`;

    // Create DB record for photos and voice samples
    let record = null;
    if (fileCategory === "photo") {
      const existingPhotos = await prisma.photo.count({ where: { userId: user.id } });
      record = await prisma.photo.create({
        data: {
          userId: user.id,
          filename,
          url,
          isPrimary: existingPhotos === 0, // first photo is primary
        },
      });
    } else if (fileCategory === "voice") {
      const existingVoices = await prisma.voiceSample.count({ where: { userId: user.id } });
      record = await prisma.voiceSample.create({
        data: {
          userId: user.id,
          filename,
          url,
          isDefault: existingVoices === 0,
        },
      });
    }

    return NextResponse.json({
      url,
      key,
      filename,
      recordId: record?.id,
    }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/upload] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
