import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { uploadFile, voiceKey } from "@/lib/storage";
import { cloneVoice } from "@/lib/voice-engine";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (audioFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file too large (max 10MB)" }, { status: 400 });
    }

    // Step 1: Upload audio to Supabase Storage
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const fileId = uuidv4();
    const ext = audioFile.name?.split(".").pop() || "webm";
    const key = voiceKey(user.id, fileId, ext);

    let audioUrl: string;
    try {
      audioUrl = await uploadFile(buffer, key, audioFile.type || "audio/webm");
    } catch (uploadErr: any) {
      console.error("[voice] Upload failed:", uploadErr);
      return NextResponse.json({ error: "Failed to upload audio" }, { status: 500 });
    }

    // Step 2: Clone voice via ElevenLabs
    const cloneName = `${user.firstName || "user"}-onboarding`;
    const cloneResult = await cloneVoice(audioUrl, cloneName);

    if (cloneResult.error || !cloneResult.voiceId) {
      console.error("[voice] Clone failed:", cloneResult.error);
      // Still save the voice sample even if cloning fails — can retry later
    }

    // Step 3: Unmark existing default voices
    await prisma.voiceSample.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    });

    // Step 4: Create VoiceSample record
    const voiceSample = await prisma.voiceSample.create({
      data: {
        userId: user.id,
        filename: audioFile.name || `voice-${fileId}.${ext}`,
        url: audioUrl,
        duration: 0, // Could compute from audio but not critical
        isDefault: true,
        voiceCloneId: cloneResult.voiceId || null,
        provider: cloneResult.provider || null,
      },
    });

    return NextResponse.json({
      success: true,
      voiceId: cloneResult.voiceId || null,
      voiceSampleId: voiceSample.id,
      cloneError: cloneResult.error || null,
    });
  } catch (err: any) {
    console.error("Voice upload failed:", err);
    return NextResponse.json(
      { error: "Failed to process voice sample" },
      { status: 500 }
    );
  }
}
