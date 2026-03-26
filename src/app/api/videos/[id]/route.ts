import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { videoUpdateSchema } from "@/lib/validations";
import { validateBody } from "@/lib/validate";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    if (!params.id) {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
    }

    const video = await prisma.video.findFirst({
      where: { id: params.id, userId: user.id },
      include: { photo: true, voice: true, schedule: true },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    return NextResponse.json(video);
  } catch (error) {
    console.error("[GET /api/videos/:id] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    if (!params.id) {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validation = validateBody(videoUpdateSchema, body);
    if (validation.error) {
      return NextResponse.json(
        { error: validation.error, fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const data = validation.data;
    const video = await prisma.video.updateMany({
      where: { id: params.id, userId: user.id },
      data,
    });

    if (video.count === 0) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const updated = await prisma.video.findFirst({ where: { id: params.id, userId: user.id } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/videos/:id] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    if (!params.id) {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
    }

    const result = await prisma.video.deleteMany({
      where: { id: params.id, userId: user.id },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/videos/:id] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
