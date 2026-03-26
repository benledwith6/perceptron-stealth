import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { scheduleCreateSchema } from "@/lib/validations";
import { validateBody } from "@/lib/validate";

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const skip = (page - 1) * limit;

    const where = { userId: user.id };
    const [schedules, total] = await Promise.all([
      prisma.schedule.findMany({
        where,
        include: { video: true },
        orderBy: { scheduledAt: "asc" },
        skip,
        take: limit,
      }),
      prisma.schedule.count({ where }),
    ]);
    return NextResponse.json({ data: schedules, total, page, limit });
  } catch (error) {
    console.error("[GET /api/schedule] Unexpected error:", error);
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

    const validation = validateBody(scheduleCreateSchema, body);
    if (validation.error) {
      return NextResponse.json(
        { error: validation.error, fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const { videoId, platform, scheduledAt } = validation.data;

    const video = await prisma.video.findFirst({
      where: { id: videoId, userId: user.id, status: "approved" },
    });
    if (!video) {
      return NextResponse.json(
        { error: "Video not found or must be approved before scheduling" },
        { status: 400 }
      );
    }

    const schedule = await prisma.schedule.create({
      data: {
        videoId,
        userId: user.id,
        platform,
        scheduledAt: new Date(scheduledAt),
      },
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    console.error("[POST /api/schedule] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
