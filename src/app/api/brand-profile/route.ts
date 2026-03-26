import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { brandProfileSchema } from "@/lib/validations";
import { validateBody } from "@/lib/validate";

export async function GET() {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    const profile = await prisma.brandProfile.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json(profile || null);
  } catch (err) {
    console.error("[GET /api/brand-profile] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to fetch brand profile" },
      { status: 500 }
    );
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

    const validation = validateBody(brandProfileSchema, body);
    if (validation.error) {
      return NextResponse.json(
        { error: validation.error, fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const data = validation.data;

    const profile = await prisma.brandProfile.upsert({
      where: { userId: user.id },
      update: {
        brandName: data.brandName ?? undefined,
        tagline: data.tagline ?? undefined,
        toneOfVoice: data.toneOfVoice ?? undefined,
        targetAudience: data.targetAudience ?? undefined,
        competitors: data.competitors ?? undefined,
        brandColors: data.brandColors ?? undefined,
        guidelines: data.guidelines ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        brandName: data.brandName || null,
        tagline: data.tagline || null,
        toneOfVoice: data.toneOfVoice || null,
        targetAudience: data.targetAudience || null,
        competitors: data.competitors || null,
        brandColors: data.brandColors || null,
        guidelines: data.guidelines || null,
      },
    });

    return NextResponse.json(profile);
  } catch (err) {
    console.error("[POST /api/brand-profile] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to save brand profile" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  // PUT delegates to POST (upsert behavior)
  return POST(req);
}
