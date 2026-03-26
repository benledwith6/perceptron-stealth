import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { voiceSampleSchema } from "@/lib/validations";
import { validateBody } from "@/lib/validate";

export async function GET() {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    const voices = await prisma.voiceSample.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(voices);
  } catch (error) {
    console.error("[GET /api/voices] Unexpected error:", error);
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

    const validation = validateBody(voiceSampleSchema, body);
    if (validation.error) {
      return NextResponse.json(
        { error: validation.error, fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const data = validation.data;
    const voice = await prisma.voiceSample.create({
      data: {
        userId: user.id,
        filename: data.filename,
        url: data.url,
        duration: data.duration,
        isDefault: data.isDefault,
      },
    });

    if (data.isDefault) {
      await prisma.voiceSample.updateMany({
        where: { userId: user.id, id: { not: voice.id } },
        data: { isDefault: false },
      });
    }

    return NextResponse.json(voice, { status: 201 });
  } catch (error) {
    console.error("[POST /api/voices] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
