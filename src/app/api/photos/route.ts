import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { photoUploadSchema } from "@/lib/validations";
import { validateBody } from "@/lib/validate";

export async function GET() {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    const photos = await prisma.photo.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(photos);
  } catch (error) {
    console.error("[GET /api/photos] Unexpected error:", error);
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

    const validation = validateBody(photoUploadSchema, body);
    if (validation.error) {
      return NextResponse.json(
        { error: validation.error, fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const data = validation.data;
    const photo = await prisma.photo.create({
      data: {
        userId: user.id,
        filename: data.filename,
        url: data.url,
        isPrimary: data.isPrimary,
      },
    });

    // If marked primary, unmark others
    if (data.isPrimary) {
      await prisma.photo.updateMany({
        where: { userId: user.id, id: { not: photo.id } },
        data: { isPrimary: false },
      });
    }

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    console.error("[POST /api/photos] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
