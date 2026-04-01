"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import SessionProvider from "@/components/SessionProvider";
import PhotoChoice from "@/components/onboarding/PhotoChoice";
import ExpressionCapture from "@/components/onboarding/ExpressionCapture";
import PhotoUpload from "@/components/onboarding/PhotoUpload";
import CharacterSheetReveal from "@/components/onboarding/CharacterSheetReveal";
import VoiceCapture from "@/components/onboarding/VoiceCapture";
import PaywallStep from "@/components/onboarding/PaywallStep";

// ─── Step types ──────────────────────────────────────────────────

type Step =
  | "welcome"
  | "photo_choice"
  | "camera_happy"
  | "camera_sad"
  | "camera_angry"
  | "camera_silly"
  | "upload_more"
  | "voice"
  | "character_reveal"
  | "paywall";

// ─── Expression definitions ──────────────────────────────────────

const EXPRESSIONS: { step: Step; emoji: string; label: string }[] = [
  { step: "camera_happy", emoji: "😊", label: "Make a happy face!" },
  { step: "camera_sad", emoji: "😢", label: "Frown" },
  { step: "camera_angry", emoji: "😠", label: "Be angry" },
  { step: "camera_silly", emoji: "🤪", label: "Be silly" },
];

// ─── Step bar groups ─────────────────────────────────────────────

type StepGroup = "photos" | "voice" | "twin" | "golive";

const STEP_GROUPS: { key: StepGroup; label: string; emoji: string }[] = [
  { key: "photos", label: "Photos", emoji: "📸" },
  { key: "voice", label: "Voice", emoji: "🎙️" },
  { key: "twin", label: "AI Twin", emoji: "🤖" },
  { key: "golive", label: "Go Live", emoji: "🚀" },
];

function stepToGroup(step: Step): StepGroup {
  if (step === "welcome") return "photos";
  if (["photo_choice", "camera_happy", "camera_sad", "camera_angry", "camera_silly", "upload_more"].includes(step))
    return "photos";
  if (step === "voice") return "voice";
  if (step === "character_reveal") return "twin";
  return "golive";
}

// ─── Step bar component ──────────────────────────────────────────

function StepBar({ current }: { current: Step }) {
  const currentGroup = stepToGroup(current);
  const groupIdx = STEP_GROUPS.findIndex((g) => g.key === currentGroup);

  const cameraSteps: Step[] = ["camera_happy", "camera_sad", "camera_angry", "camera_silly"];
  const cameraDoneCount = cameraSteps.filter((s) => {
    const sIdx = cameraSteps.indexOf(s);
    const curIdx = cameraSteps.indexOf(current as any);
    return curIdx > sIdx;
  }).length;
  const inCameraFlow = cameraSteps.includes(current);

  return (
    <div className="flex items-center gap-1.5">
      {STEP_GROUPS.map((g, i) => {
        const done = i < groupIdx;
        const active = i === groupIdx;
        return (
          <div key={g.key} className="flex items-center gap-1.5">
            {i > 0 && (
              <motion.div
                className="w-6 h-px"
                animate={{ backgroundColor: done ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.08)" }}
                transition={{ duration: 0.5 }}
              />
            )}
            <motion.div
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold transition-all"
              animate={{
                backgroundColor: active ? "rgba(99,102,241,0.15)" : done ? "rgba(99,102,241,0.06)" : "transparent",
                borderColor: active ? "rgba(99,102,241,0.35)" : done ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)",
              }}
              style={{ border: "1px solid" }}
            >
              {done ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-3.5 h-3.5 rounded-full bg-indigo-500 flex items-center justify-center"
                >
                  <Check className="w-2 h-2 text-white" />
                </motion.div>
              ) : (
                <span>{g.emoji}</span>
              )}
              <span className={active ? "text-indigo-300" : done ? "text-white/40" : "text-white/15"}>
                {g.label}
                {active && g.key === "photos" && inCameraFlow && (
                  <span className="ml-1 text-indigo-400/60">{cameraDoneCount}/4</span>
                )}
              </span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Step content config ─────────────────────────────────────────

const STEP_CONTENT: Record<Step, { heading: string; sub: string }> = {
  welcome: {
    heading: "Try out AI Content!",
    sub: "Create your AI twin and start posting in minutes.",
  },
  photo_choice: {
    heading: "Let's see that face.",
    sub: "We need a few expressions to build your AI twin.",
  },
  camera_happy: {
    heading: "Make a happy face and smile!",
    sub: "Take a photo and we'll save it to build your AI twin.",
  },
  camera_sad: {
    heading: "Now look sad.",
    sub: "A little frown goes a long way.",
  },
  camera_angry: {
    heading: "Give us angry.",
    sub: "Channel your inner intensity.",
  },
  camera_silly: {
    heading: "Last one — be silly!",
    sub: "Let loose. Have fun with it.",
  },
  upload_more: {
    heading: "Got more photos?",
    sub: "More reference = better AI twin.",
  },
  voice: {
    heading: "Now let's hear you.",
    sub: "Read the script below. ~30 seconds is perfect.",
  },
  character_reveal: {
    heading: "Building your AI twin...",
    sub: "Give us a few seconds. You're going to love this.",
  },
  paywall: {
    heading: "Your AI twin is alive.",
    sub: "Start posting daily. Zero effort.",
  },
};

// ─── Ambient background ──────────────────────────────────────────

function AmbientBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <motion.div
        className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(79,110,247,0.12) 0%, transparent 70%)" }}
        animate={{ x: [0, 40, 0], y: [0, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[30%] right-[-15%] w-[500px] h-[500px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)" }}
        animate={{ x: [0, -30, 0], y: [0, -40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      <motion.div
        className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)" }}
        animate={{ x: [0, 20, 0], y: [0, -20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 6 }}
      />
    </div>
  );
}

// ─── Event tracking ──────────────────────────────────────────────

function trackEvent(event: string, metadata?: Record<string, unknown>) {
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, metadata }),
  }).catch(() => {});
}

// ─── Main flow ───────────────────────────────────────────────────

function OnboardingFlow() {
  const [step, setStep] = useState<Step>("welcome");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);

  // Character sheet background generation
  const [posesSheetUrl, setPosesSheetUrl] = useState<string | null>(null);
  const [posesSheetId, setPosesSheetId] = useState<string | null>(null);
  const [threeDSheetId, setThreeDSheetId] = useState<string | null>(null);
  const [sheetGenerating, setSheetGenerating] = useState(false);

  // Voice
  const [voiceCloneId, setVoiceCloneId] = useState<string | null>(null);

  // Welcome video
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);

  // Shared camera stream across expression screens
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState(false);

  // Track step transitions
  useEffect(() => {
    trackEvent(`onboarding_step_${step}`);
  }, [step]);

  // ── Camera management ──

  const startCameraStream = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setCameraStream(s);
      return true;
    } catch {
      setCameraError(true);
      return false;
    }
  }, []);

  const stopCameraStream = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Photo capture handler (shared across expression screens) ──

  const handleExpressionCapture = useCallback(
    async (file: File, _previewUrl: string, nextStep: Step) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "photo");

        let uploadedUrl: string;
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) {
          uploadedUrl = (await res.json()).url;
        } else {
          uploadedUrl = `/uploads/photos/${Date.now()}-${file.name}`;
        }

        // Create photo record
        await fetch("/api/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            url: uploadedUrl,
            isPrimary: photoUrls.length === 0,
          }),
        });

        setPhotoUrls((prev) => [...prev, uploadedUrl]);
        trackEvent("onboarding_photo_captured");
      } catch {
        // Still advance
      } finally {
        setUploading(false);
        setStep(nextStep);
      }
    },
    [photoUrls.length]
  );

  // ── Character sheet background generation ──

  const startCharacterSheetGeneration = useCallback(
    async (allPhotoUrls: string[]) => {
      setSheetGenerating(true);
      try {
        const res = await fetch("/api/character-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoUrls: allPhotoUrls }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.poses?.compositeUrl) {
            setPosesSheetUrl(data.poses.compositeUrl);
            setPosesSheetId(data.poses.id || null);
          }
          if (data.threeD?.id) {
            setThreeDSheetId(data.threeD.id);
          }
        }
      } catch (err) {
        console.error("[onboarding] Character sheet generation failed:", err);
      } finally {
        setSheetGenerating(false);
      }
    },
    []
  );

  // ── Welcome video generation ──

  const generateWelcomeVideo = useCallback(async () => {
    setVideoGenerating(true);
    try {
      const res = await fetch("/api/onboarding/preview-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posesSheetUrl,
          threeDSheetId,
          voiceCloneId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.videoId) {
          setVideoId(data.videoId);
          pollVideoStatus(data.videoId);
        }
      }
    } catch {
      // Non-blocking
    }
  }, [posesSheetUrl, threeDSheetId, voiceCloneId]);

  const pollVideoStatus = useCallback(async (vid: string) => {
    const steps = ["expand", "tts", "anchor"];
    for (const s of steps) {
      try {
        await fetch("/api/generate/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: vid, step: s }),
        });
      } catch {
        break;
      }
    }

    try {
      await fetch("/api/generate/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: vid, step: "submit_all_cuts" }),
      });
    } catch {
      return;
    }

    try {
      await fetch("/api/generate/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: vid, step: "poll_all_cuts" }),
      });
    } catch {
      return;
    }

    try {
      await fetch("/api/generate/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: vid, step: "stitch" }),
      });
    } catch {
      return;
    }

    try {
      await fetch("/api/generate/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: vid, step: "poll_stitch" }),
      });
    } catch {
      return;
    }

    try {
      const statusRes = await fetch(`/api/generate/status?videoId=${vid}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.videoUrl) {
          setVideoUrl(statusData.videoUrl);
        }
      }
    } catch {
      // Non-blocking
    }
    setVideoGenerating(false);
  }, []);

  // ── Step handlers ──

  const handleChooseCamera = useCallback(async () => {
    const success = await startCameraStream();
    if (success) {
      setStep("camera_happy");
    } else {
      setStep("upload_more");
    }
  }, [startCameraStream]);

  const handleUploadComplete = useCallback(
    (urls: string[]) => {
      setPhotoUrls((prev) => [...prev, ...urls]);
      setStep("upload_more");
    },
    []
  );

  const handleUploadMoreComplete = useCallback(
    (moreUrls: string[]) => {
      const allUrls = [...photoUrls, ...moreUrls];
      setPhotoUrls(allUrls);
      stopCameraStream();
      startCharacterSheetGeneration(allUrls);
      setStep("voice");
    },
    [photoUrls, stopCameraStream, startCharacterSheetGeneration]
  );

  const handleUploadMoreSkip = useCallback(() => {
    stopCameraStream();
    startCharacterSheetGeneration(photoUrls);
    setStep("voice");
  }, [photoUrls, stopCameraStream, startCharacterSheetGeneration]);

  const handleVoiceCapture = useCallback(
    async (audioBlob: Blob) => {
      setVoiceUploading(true);
      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, `voice-${Date.now()}.webm`);
        const res = await fetch("/api/onboarding/voice", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          if (data.voiceId) setVoiceCloneId(data.voiceId);
          trackEvent("onboarding_voice_cloned");
        }
      } catch {
        // Non-blocking
      } finally {
        setVoiceUploading(false);
        setStep("character_reveal");
      }
    },
    []
  );

  const handleSkipVoice = useCallback(() => {
    trackEvent("onboarding_voice_skipped");
    setStep("character_reveal");
  }, []);

  const handleSheetSelect = useCallback(
    (poseUrl: string, sheetId: string) => {
      trackEvent("onboarding_character_selected");
      setPosesSheetUrl(poseUrl);
      setPosesSheetId(sheetId);
      setStep("paywall");
      setTimeout(() => generateWelcomeVideo(), 100);
    },
    [generateWelcomeVideo]
  );

  // ── Render ──

  const { heading, sub } = STEP_CONTENT[step];
  const expressionConfig = EXPRESSIONS.find((e) => e.step === step);

  return (
    <div className="relative min-h-screen bg-[#060610] flex flex-col overflow-hidden">
      <AmbientBg />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <span className="text-[12px]">{"\u2726"}</span>
          </div>
          <span className="text-[15px] font-bold text-white tracking-tight">Official AI</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
          <StepBar current={step} />
        </motion.div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-16 pt-2">
        <div className="w-full max-w-sm">
          {/* Heading */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step + "-h"}
              initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -16, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="text-center mb-8"
            >
              <h1 className="text-[28px] font-extrabold text-white tracking-tight leading-tight">
                {heading}
              </h1>
              <p className="text-[14px] text-white/40 mt-2 font-medium">{sub}</p>
            </motion.div>
          </AnimatePresence>

          {/* Step content */}
          <AnimatePresence mode="wait">
            {/* ── Welcome ── */}
            {step === "welcome" && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center gap-6"
              >
                {/* Hero graphic */}
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <span className="text-4xl">{"\u2728"}</span>
                </div>

                <div className="space-y-3 text-center">
                  <p className="text-[14px] text-white/50 leading-relaxed max-w-[280px] mx-auto">
                    We&apos;ll snap a few photos, clone your voice, and build an AI twin that creates content for you — on autopilot.
                  </p>
                  <div className="flex items-center justify-center gap-4 text-[12px] text-white/30 pt-1">
                    <span className="flex items-center gap-1"><span>📸</span> 4 selfies</span>
                    <span className="flex items-center gap-1"><span>🎙️</span> 30s audio</span>
                    <span className="flex items-center gap-1"><span>⏱️</span> ~2 min</span>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    const success = await startCameraStream();
                    setStep(success ? "camera_happy" : "upload_more");
                  }}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[15px] font-bold tracking-tight shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  Let&apos;s go
                </button>
              </motion.div>
            )}

            {/* ── Photo Choice ── */}
            {step === "photo_choice" && (
              <motion.div
                key="photo_choice"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <PhotoChoice
                  onChooseCamera={handleChooseCamera}
                  onUploadComplete={handleUploadComplete}
                />
              </motion.div>
            )}

            {expressionConfig && (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <ExpressionCapture
                  expression={{ emoji: expressionConfig.emoji, label: expressionConfig.label }}
                  cameraStream={cameraStream}
                  uploading={uploading}
                  onCapture={(file, url) => {
                    const idx = EXPRESSIONS.findIndex((e) => e.step === step);
                    const nextStep: Step =
                      idx < EXPRESSIONS.length - 1 ? EXPRESSIONS[idx + 1].step : "upload_more";
                    handleExpressionCapture(file, url, nextStep);
                  }}
                />
              </motion.div>
            )}

            {step === "upload_more" && (
              <motion.div
                key="upload_more"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <PhotoUpload
                  existingCount={photoUrls.length}
                  onComplete={handleUploadMoreComplete}
                  onSkip={handleUploadMoreSkip}
                />
              </motion.div>
            )}

            {step === "voice" && (
              <motion.div
                key="voice"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-3"
              >
                <VoiceCapture onCapture={handleVoiceCapture} uploading={voiceUploading} />
                <button
                  onClick={handleSkipVoice}
                  className="w-full py-2 text-[12px] text-white/15 hover:text-white/30 transition-colors"
                >
                  Skip for now — we&apos;ll use a stock voice
                </button>
              </motion.div>
            )}

            {step === "character_reveal" && (
              <motion.div
                key="character_reveal"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <CharacterSheetReveal
                  photoUrl={photoUrls[0] || ""}
                  industry="business"
                  onSelect={handleSheetSelect}
                  preloadedCompositeUrl={posesSheetUrl}
                  preloadedSheetId={posesSheetId}
                  isGenerating={sheetGenerating}
                />
              </motion.div>
            )}

            {step === "paywall" && (
              <motion.div
                key="paywall"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <PaywallStep videoUrl={videoUrl ?? undefined} videoGenerating={videoGenerating} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <SessionProvider>
      <OnboardingFlow />
    </SessionProvider>
  );
}
