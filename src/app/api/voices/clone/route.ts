import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { cloneVoice } from "@/lib/voice-engine";

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    let body: { voiceSampleId: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.voiceSampleId) {
      return NextResponse.json({ error: "voiceSampleId is required" }, { status: 400 });
    }

    const voiceSample = await prisma.voiceSample.findFirst({
      where: { id: body.voiceSampleId, userId: user.id },
    });

    if (!voiceSample) {
      return NextResponse.json({ error: "Voice sample not found" }, { status: 404 });
    }

    // If already cloned, return existing clone ID
    if (voiceSample.clonedVoiceId) {
      return NextResponse.json({
        clonedVoiceId: voiceSample.clonedVoiceId,
        provider: voiceSample.cloneProvider,
        cached: true,
      });
    }

    const result = await cloneVoice(voiceSample.url, `${user.firstName}-${user.id.slice(0, 8)}`);

    if (!result.voiceId) {
      console.error("[POST /api/voices/clone] Clone failed:", result.error);
      return NextResponse.json(
        { error: "Voice cloning failed", detail: result.error },
        { status: 502 }
      );
    }

    // Persist the cloned voice ID
    await prisma.voiceSample.update({
      where: { id: voiceSample.id },
      data: {
        clonedVoiceId: result.voiceId,
        cloneProvider: result.provider,
      },
    });

    return NextResponse.json({
      clonedVoiceId: result.voiceId,
      provider: result.provider,
      cached: false,
    });
  } catch (err) {
    console.error("[POST /api/voices/clone] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
