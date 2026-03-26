"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Upload,
  Check,
  Loader2,
  X,
  RefreshCw,
  Plus,
  Camera,
} from "lucide-react";
import SessionProvider from "@/components/SessionProvider";

type Step = "industry" | "photos" | "character" | "video";

const INDUSTRIES = [
  { id: "real_estate", label: "Real Estate", sub: "Agents, brokers, property managers" },
  { id: "legal", label: "Legal", sub: "Attorneys, law firms, paralegals" },
  { id: "medical", label: "Medical", sub: "Doctors, clinics, health practitioners" },
  { id: "creator", label: "Creator", sub: "Influencers, coaches, personal brands" },
  { id: "business", label: "Business", sub: "Consultants, agencies, startups" },
  { id: "other", label: "Other", sub: "Something different entirely" },
];

interface UploadedPhoto {
  id: string;
  filename: string;
  url: string;
  previewUrl?: string;
}

function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("industry");
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [characterSheetUrl, setCharacterSheetUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [startingFrameGenerated, setStartingFrameGenerated] = useState(false);

  const stepIndex = ["industry", "photos", "character", "video"].indexOf(step);

  // ─── Industry ──────────────────────────────────────────────────

  const selectIndustry = (id: string) => {
    setSelectedIndustry(id);
    setTimeout(() => setStep("photos"), 250);
  };

  // ─── Photos ────────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      setError(null);
      setUploading(true);

      try {
        for (let i = 0; i < Math.min(files.length, 3 - photos.length); i++) {
          const file = files[i];
          if (!file.type.startsWith("image/")) continue;
          if (file.size > 10 * 1024 * 1024) { setError("Max 10MB per photo"); continue; }

          const previewUrl = URL.createObjectURL(file);
          const formData = new FormData();
          formData.append("file", file);
          formData.append("type", "photo");

          const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
          let photoUrl: string;
          if (uploadRes.ok) {
            photoUrl = (await uploadRes.json()).url;
          } else {
            photoUrl = `/uploads/photos/${Date.now()}-${file.name}`;
          }

          const photoRes = await fetch("/api/photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, url: photoUrl, isPrimary: photos.length === 0 && i === 0 }),
          });

          if (photoRes.ok) {
            const saved = await photoRes.json();
            setPhotos((prev) => [...prev, { ...saved, previewUrl }]);
          }
        }
      } catch (err: any) {
        setError(err.message || "Upload failed");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [photos.length]
  );

  // ─── Character Sheet ───────────────────────────────────────────

  const generateCharacterSheet = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      // Filter to only Supabase URLs (not local /uploads/ fallbacks)
      const photoUrls = photos.map((p) => p.url).filter((u) => !u.startsWith("/uploads/"));

      // Call character sheet API with industry for background presets.
      // This generates BOTH the poses sheet (user-facing) and the 360-degree
      // sheet (backend-only for video model reference) in parallel.
      const res = await fetch("/api/character-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls, industry: selectedIndustry }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Generation failed");
      const data = await res.json();
      setCharacterSheetUrl(data.poses.compositeUrl);

      // After character sheets are generated, kick off starting frame generation
      // in the background. The starting frame is the anchor image used for EVERY
      // video cut to maintain character consistency.
      if (!startingFrameGenerated) {
        generateStartingFrameBackground();
      }
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Fire-and-forget starting frame generation (runs after character sheet completes)
  const generateStartingFrameBackground = async () => {
    try {
      const res = await fetch("/api/starting-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry: selectedIndustry }),
      });
      if (res.ok) {
        setStartingFrameGenerated(true);
      }
    } catch {
      // Non-blocking — the generate API has its own starting frame fallback
    }
  };

  const enterCharacterStep = () => {
    setStep("character");
    if (!characterSheetUrl && !generating) generateCharacterSheet();
  };

  // ─── Video ─────────────────────────────────────────────────────

  const enterVideoStep = () => {
    setStep("video");
    if (!videoUrl && !videoGenerating) generateFirstVideo();
  };

  // Helper to call /api/generate/process for a single step
  const processStep = async (videoId: string, step: string, cutIndex?: number) => {
    const body: Record<string, unknown> = { videoId, step };
    if (cutIndex !== undefined) body.cutIndex = cutIndex;
    const res = await fetch("/api/generate/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    // Return data even on non-200 so caller can inspect status
    return { ...data, _httpStatus: res.status };
  };

  const generateFirstVideo = async () => {
    setVideoGenerating(true);
    setVideoError(null);
    try {
      // Step 1: Create a video record
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Your First AI Video",
          description: "Generated during onboarding",
          contentType: "quick_tip_8",
          model: "kling_2.6",
        }),
      });
      if (!res.ok) throw new Error("Failed to create video record");
      const vid = await res.json();

      // Step 2: Create composition plan
      const gen = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: vid.id,
          model: "kling_2.6",
          format: "quick_tip_8",
          script: "A confident professional introducing themselves and sharing a quick tip relevant to their industry. Natural, conversational, like talking to a friend.",
        }),
      });
      if (!gen.ok) throw new Error("Failed to start generation");
      const genData = await gen.json();

      // Check if video came back immediately (demo mode)
      if (genData.video?.videoUrl) {
        setVideoUrl(genData.video.videoUrl);
        setVideoGenerating(false);
        return;
      }

      const videoId = genData.video?.id || vid.id;

      // Step 3: EXPAND — Gemini expands script into per-cut prompts
      const expandResult = await processStep(videoId, "expand");
      if (expandResult._httpStatus !== 200) throw new Error("Prompt expansion failed");

      // Step 4: TTS — Generate voiceover audio
      await processStep(videoId, "tts");

      // Step 5: Submit ALL cuts to FAL first, then poll all until done
      const totalCuts = expandResult.totalCuts || 3;

      // 5a: Submit all cuts
      for (let i = 0; i < totalCuts; i++) {
        const cutResult = await processStep(videoId, "cut", i);
        console.log(`[onboarding] Cut ${i} submitted:`, cutResult.status);
      }

      // 5b: Poll ALL cuts until every one is done or failed
      const cutsDone = new Set<number>();
      const cutsFailed = new Set<number>();
      let totalPollAttempts = 0;
      const maxTotalPolls = 180; // 180 * 5s = 15 min max total

      while (cutsDone.size + cutsFailed.size < totalCuts && totalPollAttempts < maxTotalPolls) {
        await new Promise(r => setTimeout(r, 5000)); // wait 5s
        totalPollAttempts++;

        for (let i = 0; i < totalCuts; i++) {
          if (cutsDone.has(i) || cutsFailed.has(i)) continue;
          try {
            const pollResult = await processStep(videoId, "poll", i);
            if (pollResult.status === "cut_done") {
              cutsDone.add(i);
            } else if (pollResult.status === "cut_failed") {
              cutsFailed.add(i);
            }
          } catch {
            // Network error — keep trying next poll cycle
          }
        }
      }

      if (cutsDone.size === 0) {
        throw new Error("No video cuts completed. Please try again from the dashboard.");
      }

      // Step 6: STITCH — Combine all cuts + audio into final video
      const stitchResult = await processStep(videoId, "stitch");

      if (stitchResult._httpStatus !== 200) {
        throw new Error(stitchResult.error || "Video stitching failed");
      }

      if (stitchResult.videoUrl) {
        setVideoUrl(stitchResult.videoUrl);
      }
      setVideoGenerating(false);
    } catch (err: any) {
      setVideoError(err.message || "Video generation failed");
      setVideoGenerating(false);
    }
  };

  const completeOnboarding = async () => {
    setCompleting(true);
    try { await fetch("/api/onboarding/complete", { method: "POST" }); } catch {}
    router.push("/dashboard/overview");
  };

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#050508] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-5">
        <span className="text-[15px] font-semibold tracking-tight text-white/90">
          Official <span className="text-blue-400">AI</span>
        </span>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-500 ${
                i <= stepIndex ? "bg-white w-6" : "bg-white/10 w-4"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-lg">

          {/* ════ STEP 1: INDUSTRY ════ */}
          {step === "industry" && (
            <div>
              <p className="text-sm text-white/30 mb-2">Step 1</p>
              <h1 className="text-[28px] font-semibold tracking-tight text-white leading-tight mb-1">
                What do you do?
              </h1>
              <p className="text-[15px] text-white/40 mb-10">
                We'll tailor your content to your industry.
              </p>

              <div className="space-y-2">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind.id}
                    onClick={() => selectIndustry(ind.id)}
                    className={`w-full text-left px-5 py-4 rounded-xl border transition-all duration-150 group ${
                      selectedIndustry === ind.id
                        ? "border-white/20 bg-white/[0.06]"
                        : "border-white/[0.04] hover:border-white/10 hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[15px] font-medium text-white/90">{ind.label}</div>
                        <div className="text-[13px] text-white/30 mt-0.5">{ind.sub}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/10 group-hover:text-white/30 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ════ STEP 2: PHOTOS ════ */}
          {step === "photos" && (
            <div>
              <p className="text-sm text-white/30 mb-2">Step 2</p>
              <h1 className="text-[28px] font-semibold tracking-tight text-white leading-tight mb-1">
                Upload your photos
              </h1>
              <p className="text-[15px] text-white/40 mb-10">
                1-3 clear photos. Selfies, headshots, or casual shots all work.
              </p>

              {error && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/10 text-[13px] text-red-400/80 mb-6">
                  <span className="flex-1">{error}</span>
                  <button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
                </div>
              )}

              {/* Photo slots */}
              <div className="flex gap-3 mb-8">
                {[0, 1, 2].map((i) => {
                  const photo = photos[i];
                  return (
                    <div key={i} className="relative flex-1 aspect-[3/4]">
                      <div
                        className={`w-full h-full rounded-2xl overflow-hidden transition-all ${
                          photo
                            ? "ring-1 ring-white/10"
                            : "border border-dashed border-white/[0.08] bg-white/[0.015]"
                        }`}
                      >
                        {photo?.previewUrl ? (
                          <img src={photo.previewUrl} alt="" className="w-full h-full object-cover" />
                        ) : photo ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Check className="w-5 h-5 text-white/20" />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Camera className="w-5 h-5 text-white/[0.08]" />
                          </div>
                        )}
                      </div>
                      {photo && (
                        <button
                          onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
                        >
                          <X className="w-2.5 h-2.5 text-white/60" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />

              <div className="flex items-center gap-3">
                {photos.length < 3 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/[0.06] text-[14px] text-white/50 hover:text-white/70 hover:border-white/10 hover:bg-white/[0.02] transition-all"
                  >
                    {uploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                    ) : (
                      <>{photos.length > 0 ? <Plus className="w-4 h-4" /> : <Upload className="w-4 h-4" />} {photos.length > 0 ? "Add more" : "Choose photos"}</>
                    )}
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={enterCharacterStep}
                  disabled={photos.length < 1}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ════ STEP 3: CHARACTER SHEET ════ */}
          {step === "character" && (
            <div>
              {generating ? (
                <div className="text-center py-16">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/[0.04] mb-6">
                    <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
                  </div>
                  <h1 className="text-[22px] font-semibold text-white/90 mb-2">Building your avatar</h1>
                  <p className="text-[14px] text-white/30 max-w-xs mx-auto">
                    Analyzing your photos and generating a character model. About 20 seconds.
                  </p>
                </div>
              ) : genError ? (
                <div className="text-center py-16">
                  <h1 className="text-[22px] font-semibold text-white/90 mb-2">Something went wrong</h1>
                  <p className="text-[14px] text-white/30 mb-8">{genError}</p>
                  <button
                    onClick={() => { setGenError(null); generateCharacterSheet(); }}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" /> Try again
                  </button>
                </div>
              ) : characterSheetUrl ? (
                <div>
                  <p className="text-sm text-white/30 mb-2">Step 3</p>
                  <h1 className="text-[28px] font-semibold tracking-tight text-white leading-tight mb-1">
                    Your AI avatar
                  </h1>
                  <p className="text-[15px] text-white/40 mb-8">
                    Does this look like you?
                  </p>

                  <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.06] mb-8">
                    <img src={characterSheetUrl} alt="Character Sheet" className="w-full" />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStep("photos")}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/[0.06] text-[13px] text-white/40 hover:text-white/60 hover:border-white/10 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> More photos
                    </button>
                    <button
                      onClick={() => { setCharacterSheetUrl(null); generateCharacterSheet(); }}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/[0.06] text-[13px] text-white/40 hover:text-white/60 hover:border-white/10 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={enterVideoStep}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 transition-all"
                    >
                      Looks like me <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Demo mode */
                <div className="text-center py-16">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/[0.04] mb-6">
                    <Check className="w-5 h-5 text-white/30" />
                  </div>
                  <h1 className="text-[22px] font-semibold text-white/90 mb-2">Avatar created</h1>
                  <p className="text-[14px] text-white/30 mb-8">Your character model is ready.</p>
                  <button
                    onClick={enterVideoStep}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 transition-all"
                  >
                    Generate my video <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════ STEP 4: VIDEO ════ */}
          {step === "video" && (
            <div>
              {videoGenerating ? (
                <div className="text-center py-16">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/[0.04] mb-6">
                    <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
                  </div>
                  <h1 className="text-[22px] font-semibold text-white/90 mb-2">Generating your video</h1>
                  <p className="text-[14px] text-white/30 max-w-xs mx-auto">
                    Creating a short clip featuring your AI avatar. This is the good part.
                  </p>
                  <p className="text-[12px] text-white/15 mt-4 max-w-xs mx-auto">
                    This usually takes 1-3 minutes. We'll show it as soon as it's ready.
                  </p>
                </div>
              ) : videoError ? (
                <div className="text-center py-16">
                  <h1 className="text-[22px] font-semibold text-white/90 mb-2">Generation issue</h1>
                  <p className="text-[14px] text-white/30 mb-8">{videoError}</p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => { setVideoError(null); generateFirstVideo(); }}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/[0.06] text-[14px] text-white/50 hover:text-white/70 hover:border-white/10 transition-all"
                    >
                      <RefreshCw className="w-4 h-4" /> Try again
                    </button>
                    <button
                      onClick={completeOnboarding}
                      disabled={completing}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 disabled:opacity-40 transition-all"
                    >
                      {completing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Setting up...</>
                      ) : (
                        <>Skip to dashboard <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-white/30 mb-2">Step 4</p>
                  <h1 className="text-[28px] font-semibold tracking-tight text-white leading-tight mb-1">
                    {videoUrl ? "Here's your first video" : "You're ready"}
                  </h1>
                  <p className="text-[15px] text-white/40 mb-8">
                    {videoUrl
                      ? "This is what AI can do with your face. Imagine this, every week, on autopilot."
                      : "Your AI marketing teammate is set up and ready to create."}
                  </p>

                  {videoUrl && (
                    <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.06] bg-black aspect-video mb-8">
                      <video src={videoUrl} controls autoPlay muted loop className="w-full h-full object-cover" />
                    </div>
                  )}

                  <button
                    onClick={completeOnboarding}
                    disabled={completing}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 disabled:opacity-40 transition-all"
                  >
                    {completing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Setting up...</>
                    ) : (
                      <>Go to dashboard <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <SessionProvider>
      <OnboardingFlow />
    </SessionProvider>
  );
}
