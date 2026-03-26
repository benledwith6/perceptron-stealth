import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { videoCreateSchema } from "@/lib/validations";
import { validateBody } from "@/lib/validate";

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const contentType = searchParams.get("type");

    // Validate filter values to prevent unexpected queries
    const VALID_STATUSES = ["draft", "generating", "review", "approved", "published", "rejected", "failed"];
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId: user.id };
    if (status) where.status = status;
    if (contentType) where.contentType = contentType;

    // Never show individual cuts to the user — only parent videos.
    // Cuts have contentType starting with "cut_" (e.g. "cut_hook", "cut_talking_head")
    where.NOT = { contentType: { startsWith: "cut_" } };

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        include: { photo: true, voice: true, schedule: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.video.count({ where }),
    ]);

    return NextResponse.json({ data: videos, total, page, limit });
  } catch (error) {
    console.error("[GET /api/videos] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validation = validateBody(videoCreateSchema, body);
    if (validation.error) {
      return NextResponse.json(
        { error: validation.error, fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const data = validation.data;
    const video = await prisma.video.create({
      data: {
        userId: user.id,
        title: data.title,
        description: data.description,
        script: data.script,
        model: data.model,
        contentType: data.contentType,
        sourceReview: data.sourceReview,
        photoId: data.photoId,
        voiceId: data.voiceId,
        status: "draft",
      },
    });

    return NextResponse.json(video, { status: 201 });
  } catch (error) {
    console.error("[POST /api/videos] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
