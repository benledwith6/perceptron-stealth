"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  Sparkles,
  Video,
  Calendar,
  BarChart3,
  Play,
  Mic,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SessionProvider from "@/components/SessionProvider";
import VoiceRecorder from "@/components/VoiceRecorder";
import { GenerationProgressBar } from "@/components/GenerationProgress";
import type { GenerationProgress as ProgressType } from "@/hooks/use-generation-progress";

type Step = "industry" | "photos" | "character" | "voice" | "video";

// Sub-phases within the video step for the premium loading experience
type VideoPhase =
  | "flashback"   // Brief character sheet recall
  | "generating"  // Active pipeline with progress steps
  | "reveal"      // Cinematic video reveal + auto-play
  | "reaction"    // Post-watch "This is you" moment
  | "error";      // Friendly error state

// Pipeline steps shown during generation
interface PipelineStep {
  id: string;
  label: string;
  sublabel: string;
  status: "waiting" | "active" | "done" | "error";
}

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

// ─── Animated Orb (premium loading indicator) ────────────────────────────
function PulseOrb({ size = 48 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(76,110,245,0.3) 0%, transparent 70%)",
        }}
        animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)",
        }}
        animate={{ scale: [1, 2.2, 1], opacity: [0.4, 0, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      <motion.div
        className="absolute inset-2 rounded-full"
        style={{
          background: "linear-gradient(135deg, #4c6ef5 0%, #7c3aed 50%, #06b6d4 100%)",
          boxShadow: "0 0 30px rgba(76,110,245,0.4), 0 0 60px rgba(139,92,246,0.2)",
        }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// ─── Pipeline Step Row ───────────────────────────────────────────────────
function PipelineStepRow({ pipelineStep, index }: { pipelineStep: PipelineStep; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-4"
    >
      <div className="relative flex-shrink-0 w-8 h-8 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {pipelineStep.status === "waiting" && (
            <motion.div
              key="waiting"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="w-2.5 h-2.5 rounded-full bg-white/[0.08]"
            />
          )}
          {pipelineStep.status === "active" && (
            <motion.div key="active" className="relative">
              <motion.div
                className="w-8 h-8 rounded-full border-2 border-transparent"
                style={{
                  borderTopColor: "rgba(76,110,245,0.8)",
                  borderRightColor: "rgba(139,92,246,0.4)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
              </div>
            </motion.div>
          )}
          {pipelineStep.status === "done" && (
            <motion.div
              key="done"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center"
            >
              <Check className="w-3.5 h-3.5 text-blue-400" />
            </motion.div>
          )}
          {pipelineStep.status === "error" && (
            <motion.div
              key="error"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5 text-red-400" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={`text-[14px] font-medium transition-colors duration-500 ${
            pipelineStep.status === "active"
              ? "text-white"
              : pipelineStep.status === "done"
                ? "text-white/50"
                : pipelineStep.status === "error"
                  ? "text-red-400/80"
                  : "text-white/20"
          }`}
        >
          {pipelineStep.label}
        </div>
        <div
          className={`text-[12px] transition-colors duration-500 ${
            pipelineStep.status === "active" ? "text-white/30" : "text-white/10"
          }`}
        >
          {pipelineStep.sublabel}
        </div>
      </div>
    </motion.div>
  );
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);

  // Video step sub-phases
  const [videoPhase, setVideoPhase] = useState<VideoPhase>("flashback");
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [pipelineProgress, setPipelineProgress] = useState<ProgressType | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  const stepIndex = ["industry", "photos", "character", "voice", "video"].indexOf(step);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      abortRef.current = true;
    };
  }, []);

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
      const photoUrls = photos.map((p) => p.url).filter((u) => !u.startsWith("/uploads/"));

      const res = await fetch("/api/character-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls, industry: selectedIndustry }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Generation failed");
      const data = await res.json();
      setCharacterSheetUrl(data.poses.compositeUrl);

      if (!startingFrameGenerated) {
        generateStartingFrameBackground();
      }
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

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
      // Non-blocking
    }
  };

  const enterCharacterStep = () => {
    setStep("character");
    if (!characterSheetUrl && !generating) generateCharacterSheet();
  };

  // ─── Video (Premium Pipeline) ──────────────────────────────────

  const enterVideoStep = () => {
    setStep("video");
    setVideoPhase("flashback");
    abortRef.current = false;

    // Show the character sheet flashback for 2.5s, then begin generation
    setTimeout(() => {
      if (!abortRef.current) {
        setVideoPhase("generating");
        if (!videoUrl && !videoGenerating) generateFirstVideo();
      }
    }, 2500);
  };

  // Helper to update a pipeline step's status
  const updatePipelineStep = (id: string, status: PipelineStep["status"]) => {
    setPipelineSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s))
    );
  };

  // Helper to update a pipeline step's sublabel
  const updatePipelineSublabel = (id: string, sublabel: string) => {
    setPipelineSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, sublabel } : s))
    );
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const generateFirstVideo = async () => {
    setVideoGenerating(true);
    setVideoError(null);

    // Initialize pipeline steps
    setPipelineSteps([
      { id: "create", label: "Preparing your video", sublabel: "Setting up the canvas", status: "active" },
      { id: "expand", label: "Expanding your script", sublabel: "AI crafting the perfect intro", status: "waiting" },
      { id: "tts", label: "Generating voiceover", sublabel: "Creating natural speech", status: "waiting" },
      { id: "render", label: "Generating scenes", sublabel: "Creating anchor image", status: "waiting" },
      { id: "finalize", label: "Stitching final video", sublabel: "Almost done", status: "waiting" },
    ]);

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

      updatePipelineStep("create", "done");
      if (abortRef.current) return;

      // Step 2: Kick off generation
      updatePipelineStep("expand", "active");
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

      // Immediate result (demo mode)
      if (genData.video?.videoUrl) {
        setPipelineSteps((prev) => prev.map((s) => ({ ...s, status: "done" as const })));
        setVideoUrl(genData.video.videoUrl);
        setVideoGenerating(false);
        // Brief pause before the cinematic reveal
        setTimeout(() => setVideoPhase("reveal"), 800);
        return;
      }

      const videoId = genData.video?.id || vid.id;

      // Step 3: Drive the pipeline step by step
      await drivePipeline(videoId);
    } catch (err: any) {
      setVideoError(err.message || "Video generation failed");
      setVideoGenerating(false);
      setVideoPhase("error");
    }
  };

  const drivePipeline = async (videoId: string) => {
    try {
      // ── Expand prompts ──
      updatePipelineStep("expand", "active");
      setPipelineProgress({ step: "expand", currentCut: 0, totalCuts: 0, percent: 5 });
      const expandRes = await fetch("/api/generate/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, step: "expand" }),
      });
      if (!expandRes.ok) throw new Error("Script expansion failed");
      const expandData = await expandRes.json();
      updatePipelineStep("expand", "done");
      if (abortRef.current) return;

      // ── TTS ──
      updatePipelineStep("tts", "active");
      setPipelineProgress({ step: "tts", currentCut: 0, totalCuts: 0, percent: 15 });
      const ttsRes = await fetch("/api/generate/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, step: "tts" }),
      });
      if (!ttsRes.ok) throw new Error("Voice generation failed");
      updatePipelineStep("tts", "done");
      if (abortRef.current) return;

      // ── Render cuts ──
      updatePipelineStep("render", "active");
      const totalCuts = expandData.totalCuts || 1;
      setPipelineProgress({ step: "anchor", currentCut: 0, totalCuts, percent: 20 });

      updatePipelineSublabel("render", `Creating anchor image...`);

      for (let i = 0; i < totalCuts; i++) {
        if (abortRef.current) return;

        updatePipelineSublabel("render", i === 0 ? `Creating anchor image...` : `Generating scene ${i + 1} of ${totalCuts}...`);
        const cutPercent = 20 + Math.round((i / totalCuts) * 65);
        setPipelineProgress({ step: "cut", currentCut: i, totalCuts, percent: cutPercent });

        // Submit cut
        const cutRes = await fetch("/api/generate/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId, step: "cut", cutIndex: i }),
        });
        if (!cutRes.ok) throw new Error(`Failed to render cut ${i + 1}`);
        const cutData = await cutRes.json();

        // If cut needs polling (async FAL job)
        if (cutData.nextStep === "poll") {
          let pollAttempts = 0;
          const maxAttempts = 120; // 120 * 3s = 6 min max per cut

          while (pollAttempts < maxAttempts && !abortRef.current) {
            await sleep(3000);
            pollAttempts++;

            const pollRes = await fetch("/api/generate/process", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ videoId, step: "poll", cutIndex: i }),
            });
            if (!pollRes.ok) continue;
            const pollData = await pollRes.json();

            if (pollData.status === "cut_done") break;
            if (pollData.status === "polling") continue;
          }

          if (pollAttempts >= maxAttempts) {
            throw new Error("Video rendering is taking too long. Check your dashboard later.");
          }
        }
      }

      updatePipelineStep("render", "done");
      if (abortRef.current) return;

      // ── Stitch ──
      updatePipelineStep("finalize", "active");
      setPipelineProgress({ step: "stitch", currentCut: 0, totalCuts, percent: 90 });
      const stitchRes = await fetch("/api/generate/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, step: "stitch" }),
      });
      if (!stitchRes.ok) throw new Error("Final processing failed");
      const stitchData = await stitchRes.json();

      updatePipelineStep("finalize", "done");
      setPipelineProgress({ step: "done", currentCut: 0, totalCuts: 0, percent: 100 });

      if (stitchData.videoUrl) {
        setVideoUrl(stitchData.videoUrl);
      }

      setVideoGenerating(false);
      // Brief pause before the cinematic reveal
      setTimeout(() => setVideoPhase("reveal"), 800);
    } catch (err: any) {
      setVideoError(err.message || "Video generation failed");
      setVideoGenerating(false);
      setVideoPhase("error");
    }
  };

  // Old polling fallback (kept for status-based polling if pipeline driver is skipped)
  const startPolling = (videoId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let pollCount = 0;
    const maxPolls = 60;

    pollRef.current = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        if (pollRef.current) clearInterval(pollRef.current);
        setVideoGenerating(false);
        setVideoError("Video is taking longer than expected. Check your dashboard later.");
        setVideoPhase("error");
        return;
      }

      try {
        const statusRes = await fetch(`/api/generate/status?videoId=${videoId}`);
        if (!statusRes.ok) return;
        const { video } = await statusRes.json();

        if (video.status === "review" || video.status === "approved" || video.status === "published") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (video.videoUrl) setVideoUrl(video.videoUrl);
          setVideoGenerating(false);
          setTimeout(() => setVideoPhase("reveal"), 800);
        } else if (video.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setVideoGenerating(false);
          setVideoError("Video generation failed. You can try again.");
          setVideoPhase("error");
        }
      } catch {
        // Network error -- keep trying
      }
    }, 5000);
  };

  const completeOnboarding = async () => {
    setCompleting(true);
    try { await fetch("/api/onboarding/complete", { method: "POST" }); } catch {}
    router.push("/dashboard/overview");
  };

  const retryVideo = () => {
    setVideoError(null);
    setVideoUrl(null);
    setVideoPhase("generating");
    generateFirstVideo();
  };

  const handleVideoEnded = () => {
    // Transition to reaction moment after the video finishes
    setTimeout(() => setVideoPhase("reaction"), 600);
  };

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#050508] flex flex-col">
      {/* Top bar -- hidden during reveal/reaction for immersive feel */}
      <AnimatePresence>
        {!(step === "video" && (videoPhase === "reveal" || videoPhase === "reaction")) && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="flex items-center justify-between px-6 py-5"
          >
            <span className="text-[15px] font-semibold tracking-tight text-white/90">
              Official <span className="text-blue-400">AI</span>
            </span>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    i <= stepIndex ? "bg-white w-6" : "bg-white/10 w-4"
                  }`}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className={`flex-1 flex items-center justify-center pb-12 ${
        step === "video" && (videoPhase === "reveal" || videoPhase === "reaction")
          ? "px-4 sm:px-6"
          : "px-6"
      }`}>
        <div className={`w-full ${
          step === "video" && (videoPhase === "reveal" || videoPhase === "reaction")
            ? "max-w-2xl"
            : "max-w-lg"
        }`}>

          {/* ════ STEP 1: INDUSTRY ════ */}
          {step === "industry" && (
            <div>
              <p className="text-sm text-white/30 mb-2">Step 1</p>
              <h1 className="text-[28px] font-semibold tracking-tight text-white leading-tight mb-1">
                What do you do?
              </h1>
              <p className="text-[15px] text-white/40 mb-10">
                We&apos;ll tailor your content to your industry.
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
                          className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-colors"
                        >
                          <X className="w-3.5 h-3.5 text-white/60" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" capture="user" multiple onChange={handleFileSelect} className="hidden" />

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {photos.length < 3 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 px-5 py-3.5 min-h-[48px] rounded-xl border border-white/[0.06] text-[14px] text-white/50 hover:text-white/70 hover:border-white/10 hover:bg-white/[0.02] active:bg-white/[0.04] transition-all"
                  >
                    {uploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                    ) : (
                      <>{photos.length > 0 ? <Plus className="w-4 h-4" /> : <Upload className="w-4 h-4" />} {photos.length > 0 ? "Add more" : "Choose photos"}</>
                    )}
                  </button>
                )}
                <div className="hidden sm:block flex-1" />
                <button
                  onClick={enterCharacterStep}
                  disabled={photos.length < 1}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 active:bg-white/80 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
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

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStep("photos")}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/[0.06] text-[13px] text-white/40 hover:text-white/60 hover:border-white/10 active:bg-white/[0.04] transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> More photos
                      </button>
                      <button
                        onClick={() => { setCharacterSheetUrl(null); generateCharacterSheet(); }}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-white/[0.06] text-[13px] text-white/40 hover:text-white/60 hover:border-white/10 active:bg-white/[0.04] transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Retry
                      </button>
                    </div>
                    <div className="hidden sm:block flex-1" />
                    <button
                      onClick={() => setStep("voice")}
                      className="flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 active:bg-white/80 transition-all"
                    >
                      Looks like me <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/[0.04] mb-6">
                    <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
                  </div>
                  <h1 className="text-[22px] font-semibold text-white/90 mb-2">Building your avatar</h1>
                  <p className="text-[14px] text-white/30 mb-8">Generating your character sheet...</p>
                  <button
                    onClick={() => generateCharacterSheet()}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" /> Generate now
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════ STEP 4: VOICE RECORDING ════ */}
          {step === "voice" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.04] mb-5">
                  <Mic className="w-6 h-6 text-white/30" />
                </div>
                <p className="text-sm text-white/30 mb-2">Step 4</p>
                <h1 className="text-[28px] font-semibold tracking-tight text-white leading-tight mb-1">
                  Record your voice
                </h1>
                <p className="text-[15px] text-white/40 max-w-sm mx-auto">
                  Read the script below so we can clone your voice for videos.
                </p>
              </div>

              <VoiceRecorder
                onSaved={(voiceSampleId) => {
                  // Clone voice in background — don't block onboarding flow
                  fetch("/api/voices/clone", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ voiceSampleId }),
                  }).catch((err) =>
                    console.warn("[onboarding] Voice clone failed:", err)
                  );
                  enterVideoStep();
                }}
                onSkip={() => enterVideoStep()}
              />

            </motion.div>
          )}

          {/* ════ STEP 5: VIDEO (Premium Experience) ════ */}
          {step === "video" && (
            <AnimatePresence mode="wait">

              {/* ── Phase: Flashback (character sheet recall) ── */}
              {videoPhase === "flashback" && (
                <motion.div
                  key="flashback"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="text-center py-8"
                >
                  {characterSheetUrl && (
                    <motion.div
                      initial={{ opacity: 0, y: 20, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      className="relative mx-auto mb-8 max-w-[280px]"
                    >
                      <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.08]">
                        <img src={characterSheetUrl} alt="Your avatar" className="w-full" />
                      </div>
                      {/* Ambient glow behind the image */}
                      <div
                        className="absolute inset-0 -z-10 rounded-2xl blur-3xl opacity-20"
                        style={{ background: "linear-gradient(135deg, #4c6ef5, #7c3aed)" }}
                      />
                    </motion.div>
                  )}

                  {!characterSheetUrl && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.6 }}
                      className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/[0.03] border border-white/[0.06] mb-8"
                    >
                      <Check className="w-8 h-8 text-blue-400/50" />
                    </motion.div>
                  )}

                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="text-[18px] font-medium text-white/70"
                  >
                    Now let&apos;s bring you to life
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2, duration: 0.8 }}
                    className="mt-4 flex justify-center"
                  >
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-white/30"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                        />
                      ))}
                    </div>
                  </motion.div>

                  {/* Demo skip button */}
                </motion.div>
              )}

              {/* ── Phase: Generating (pipeline progress) ── */}
              {videoPhase === "generating" && (
                <motion.div
                  key="generating"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="py-8"
                >
                  {/* Orb + heading */}
                  <div className="text-center mb-12">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      className="flex justify-center mb-8"
                    >
                      <PulseOrb size={56} />
                    </motion.div>

                    <motion.h1
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.5 }}
                      className="text-[24px] font-semibold tracking-tight text-white mb-2"
                    >
                      Creating your first video
                    </motion.h1>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4, duration: 0.5 }}
                      className="text-[14px] text-white/30 max-w-sm mx-auto"
                    >
                      This is the good part. Your AI avatar is coming to life.
                    </motion.p>
                  </div>

                  {/* Pipeline steps */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                    className="space-y-4 max-w-sm mx-auto"
                  >
                    {pipelineSteps.map((s, i) => (
                      <PipelineStepRow key={s.id} pipelineStep={s} index={i} />
                    ))}
                  </motion.div>

                  {/* Progress bar */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    className="max-w-sm mx-auto mt-8"
                  >
                    <GenerationProgressBar progress={pipelineProgress} />
                  </motion.div>

                  {/* Elapsed time hint */}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5, duration: 0.8 }}
                    className="text-center text-[12px] text-white/10 mt-6"
                  >
                    Usually takes 1-3 minutes. Stay on this page.
                  </motion.p>

                  {/* Demo skip buttons */}
                </motion.div>
              )}

              {/* ── Phase: Reveal (cinematic video playback) ── */}
              {videoPhase === "reveal" && (
                <motion.div
                  key="reveal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  className="py-4"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                    className="relative"
                  >
                    {/* Ambient glow */}
                    <div
                      className="absolute -inset-8 -z-10 rounded-3xl blur-3xl opacity-15"
                      style={{ background: "linear-gradient(135deg, #4c6ef5 0%, #7c3aed 50%, #06b6d4 100%)" }}
                    />

                    {/* Video player -- 9:16 portrait, centered */}
                    <div
                      className="relative rounded-2xl overflow-hidden bg-black ring-1 ring-white/[0.08] aspect-[9/16] mx-auto"
                      style={{ maxWidth: "380px", maxHeight: "75vh" }}
                    >
                      {videoUrl ? (
                        <video
                          ref={videoPlayerRef}
                          src={videoUrl}
                          autoPlay
                          playsInline
                          muted
                          onEnded={handleVideoEnded}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play className="w-10 h-10 text-white/20" />
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* Subtle skip-to-reaction link */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2, duration: 0.8 }}
                    className="text-center mt-8"
                  >
                    <button
                      onClick={() => setVideoPhase("reaction")}
                      className="text-[13px] text-white/20 hover:text-white/40 transition-colors"
                    >
                      Continue
                    </button>
                  </motion.div>
                </motion.div>
              )}

              {/* ── Phase: Reaction (post-watch moment) ── */}
              {videoPhase === "reaction" && (
                <motion.div
                  key="reaction"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="py-8"
                >
                  {/* Sparkle icon */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                    className="flex justify-center mb-6"
                  >
                    <div className="relative">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{
                          background: "linear-gradient(135deg, rgba(76,110,245,0.15), rgba(139,92,246,0.15))",
                          border: "1px solid rgba(76,110,245,0.2)",
                        }}
                      >
                        <Sparkles className="w-7 h-7 text-blue-400" />
                      </div>
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: "radial-gradient(circle, rgba(76,110,245,0.2) 0%, transparent 70%)",
                        }}
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    </div>
                  </motion.div>

                  <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                    className="text-center text-[28px] font-semibold tracking-tight text-white mb-2"
                  >
                    This is you, powered by AI
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="text-center text-[15px] text-white/40 mb-10 max-w-sm mx-auto"
                  >
                    Your first video is ready. Imagine this, every week, on autopilot.
                    No filming. No editing. No crew.
                  </motion.p>

                  {/* What you can do next */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                    className="grid grid-cols-3 gap-3 mb-10 max-w-md mx-auto"
                  >
                    {[
                      { icon: Video, label: "Create videos", sub: "Any topic, any style" },
                      { icon: Calendar, label: "Schedule posts", sub: "Set it and forget it" },
                      { icon: BarChart3, label: "Track results", sub: "See what performs" },
                    ].map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 + i * 0.1, duration: 0.4 }}
                        className="text-center px-3 py-4 rounded-xl border border-white/[0.04] bg-white/[0.015]"
                      >
                        <item.icon className="w-5 h-5 text-blue-400/60 mx-auto mb-2" />
                        <div className="text-[13px] font-medium text-white/70">{item.label}</div>
                        <div className="text-[11px] text-white/20 mt-0.5">{item.sub}</div>
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* CTA */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9, duration: 0.5 }}
                    className="flex justify-center"
                  >
                    <button
                      onClick={completeOnboarding}
                      disabled={completing}
                      className="group flex items-center gap-3 px-8 py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                      style={{
                        background: "linear-gradient(135deg, #4c6ef5 0%, #7c3aed 100%)",
                        boxShadow: "0 4px 24px rgba(76,110,245,0.3), 0 0 0 1px rgba(76,110,245,0.2)",
                      }}
                    >
                      {completing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Setting up your dashboard...</span>
                        </>
                      ) : (
                        <>
                          <span>Continue to dashboard</span>
                          <ArrowRight className="w-4 h-4 text-white/80 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </button>
                  </motion.div>
                </motion.div>
              )}

              {/* ── Phase: Error ── */}
              {videoPhase === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="text-center py-16"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-6"
                    style={{
                      background: "rgba(239,68,68,0.06)",
                      border: "1px solid rgba(239,68,68,0.12)",
                    }}
                  >
                    <RefreshCw className="w-6 h-6 text-red-400/60" />
                  </motion.div>

                  <h1 className="text-[22px] font-semibold text-white/90 mb-2">
                    Hit a snag
                  </h1>
                  <p className="text-[14px] text-white/30 mb-2 max-w-sm mx-auto">
                    {videoError || "Something went wrong during generation."}
                  </p>
                  <p className="text-[13px] text-white/15 mb-10 max-w-sm mx-auto">
                    This sometimes happens with AI video generation. A retry usually fixes it.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={retryVideo}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        background: "linear-gradient(135deg, #4c6ef5 0%, #7c3aed 100%)",
                        boxShadow: "0 4px 20px rgba(76,110,245,0.25)",
                      }}
                    >
                      <RefreshCw className="w-4 h-4" /> Try again
                    </button>
                    <button
                      onClick={completeOnboarding}
                      disabled={completing}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/[0.06] text-[14px] text-white/40 hover:text-white/60 hover:border-white/10 transition-all"
                    >
                      {completing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Redirecting...
                        </>
                      ) : (
                        <>
                          Skip to dashboard <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
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
