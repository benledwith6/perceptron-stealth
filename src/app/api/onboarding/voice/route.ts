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

    // Step 2: Unmark existing default voices
    await prisma.voiceSample.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    });

    // Step 3: Create VoiceSample record immediately (without voice clone ID yet)
    const voiceSample = await prisma.voiceSample.create({
      data: {
        userId: user.id,
        filename: audioFile.name || `voice-${fileId}.${ext}`,
        url: audioUrl,
        duration: 0,
        isDefault: true,
        voiceCloneId: null, // Updated in background once ElevenLabs completes
        provider: null,
      },
    });

    // Step 4: Clone voice in background — don't block the response
    const cloneName = `${user.firstName || "user"}-onboarding`;
    cloneVoice(audioUrl, cloneName)
      .then(async (cloneResult) => {
        if (cloneResult.voiceId) {
          await prisma.voiceSample.update({
            where: { id: voiceSample.id },
            data: {
              voiceCloneId: cloneResult.voiceId,
              provider: cloneResult.provider || null,
            },
          });
          console.log(`[voice] Clone complete for sample ${voiceSample.id}: ${cloneResult.voiceId}`);
        } else {
          console.error("[voice] Clone failed:", cloneResult.error);
        }
      })
      .catch((err) => {
        console.error("[voice] Background clone error:", err);
      });

    // Respond immediately — cloning continues in the background
    return NextResponse.json({
      success: true,
      voiceId: null, // Not available yet; clone is async
      voiceSampleId: voiceSample.id,
      cloning: true,
    });
  } catch (err: any) {
    console.error("Voice upload failed:", err);
    return NextResponse.json(
      { error: "Failed to process voice sample" },
      { status: 500 }
    );
  }
}
