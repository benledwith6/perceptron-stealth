import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { analyzeVideo, saveToPromptLibrary, getPromptLibrary } from "@/lib/ugc-analyzer";
import { generateHookVariations } from "@/lib/hook-generator";

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    let body: { videoDescription?: string; action?: string; name?: string };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const action = body.action || "analyze";

    if (!["analyze", "save", "hooks"].includes(action)) {
      return NextResponse.json({ error: "action must be one of: analyze, save, hooks" }, { status: 400 });
    }

    // Validate videoDescription length to prevent abuse of the AI API
    if (body.videoDescription && body.videoDescription.length > 10000) {
      return NextResponse.json({ error: "videoDescription must be 10000 characters or less" }, { status: 400 });
    }

    if (body.name && body.name.length > 200) {
      return NextResponse.json({ error: "name must be 200 characters or less" }, { status: 400 });
    }

    if (action === "analyze" && body.videoDescription) {
      const analysis = await analyzeVideo(body.videoDescription);
      if (!analysis) {
        return NextResponse.json({ error: "Analysis failed. Check GOOGLE_AI_STUDIO_KEY." }, { status: 500 });
      }
      return NextResponse.json(analysis);
    }

    if (action === "save" && body.videoDescription && body.name) {
      const analysis = await analyzeVideo(body.videoDescription);
      if (!analysis) {
        return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
      }
      await saveToPromptLibrary(body.name, analysis, user.id);
      return NextResponse.json({ success: true, analysis });
    }

    if (action === "hooks" && body.videoDescription) {
      const hooks = await generateHookVariations(body.videoDescription);
      return NextResponse.json({ hooks });
    }

    return NextResponse.json({ error: "Provide videoDescription and action (analyze|save|hooks)" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/analyze]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    const library = await getPromptLibrary(user.id);
    return NextResponse.json(library);
  } catch (err) {
    console.error("[GET /api/analyze]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
