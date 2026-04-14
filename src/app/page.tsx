"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import SessionProvider from "@/components/SessionProvider";
import PhotoChoice from "@/components/onboarding/PhotoChoice";
import ExpressionCapture from "@/components/onboarding/ExpressionCapture";
import CharacterSheetReveal from "@/components/onboarding/CharacterSheetReveal";
import VoiceCapture from "@/components/onboarding/VoiceCapture";
import PaywallStep from "@/components/onboarding/PaywallStep";

// ─── Step types ──────────────────────────────────────────────────

type Step =
  | "welcome"
  | "photo_choice"
  | "photo_capture"
  | "voice"
  | "character_reveal"
  | "paywall";

// ─── Step bar groups ─────────────────────────────────────────────

type StepGroup = "photos" | "voice" | "twin" | "golive";

const STEP_GROUPS: { key: StepGroup; label: string; emoji: string }[] = [
  { key: "photos", label: "Photos", emoji: "📸" },
  { key: "voice", label: "Voice", emoji: "🎙️" },
  { key: "twin", label: "AI Twin", emoji: "🤖" },
  { key: "golive", label: "Go Live", emoji: "🚀" },
];

function stepToGroup(step: Step): StepGroup {
  if (["welcome", "photo_choice", "photo_capture"].includes(step)) return "photos";
  if (step === "voice") return "voice";
  if (step === "character_reveal") return "twin";
  return "golive";
}

// ─── Step bar component ──────────────────────────────────────────

function StepBar({ current }: { current: Step }) {
  const currentGroup = stepToGroup(current);
  const groupIdx = STEP_GROUPS.findIndex((g) => g.key === currentGroup);

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
    sub: "Take a photo or upload one from your device.",
  },
  photo_capture: {
    heading: "Take a selfie.",
    sub: "Look straight at the camera — natural expression.",
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
  const [videoSubmitted, setVideoSubmitted] = useState(false);

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

  // Auto-submit FAL video as soon as character sheets are ready.
  // Sheets start generating after the 4th expression photo, so by the time
  // the user finishes the voice step the video is already in flight.
  useEffect(() => {
    if (!sheetGenerating && posesSheetId && !videoSubmitted) {
      setVideoSubmitted(true);
      generateWelcomeVideo();
    }
  // generateWelcomeVideo has stable [] deps — safe to omit to avoid TDZ ordering issue
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetGenerating, posesSheetId, videoSubmitted]);

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
      // Server fetches photos + character sheets from DB directly — no body needed
      const res = await fetch("/api/onboarding/preview-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
  // pollVideoStatus has stable [] deps so it's safe to omit from this array
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollVideoStatus = useCallback(async (vid: string) => {
    const MAX_POLLS = 150; // ~5 minutes at 2s intervals
    const POLL_INTERVAL = 2000;

    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const res = await fetch(`/api/onboarding/preview-video/status?videoId=${vid}`);
        if (!res.ok) break;

        const data = await res.json();

        if (data.status === "completed" && data.videoUrl) {
          setVideoUrl(data.videoUrl);
          setVideoGenerating(false);
          return;
        }

        if (data.status === "failed") {
          console.error("[poll] Welcome video failed:", data.error);
          break;
        }

        // Still processing — wait and poll again
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      } catch {
        break;
      }
    }

    setVideoGenerating(false);
  }, []);

  // ── Step handlers ──

  const handleChooseCamera = useCallback(async () => {
    const success = await startCameraStream();
    setStep(success ? "photo_capture" : "photo_choice");
  }, [startCameraStream]);

  // Called after a single camera photo is captured and uploaded
  const handleSingleCapture = useCallback(
    async (file: File, _previewUrl: string) => {
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

        await fetch("/api/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, url: uploadedUrl, isPrimary: true }),
        });

        setPhotoUrls([uploadedUrl]);
        trackEvent("onboarding_photo_captured");

        // Kick off character sheet generation now — it'll run while user is on voice step
        stopCameraStream();
        startCharacterSheetGeneration([]);
      } catch {
        stopCameraStream();
      } finally {
        setUploading(false);
        setStep("voice");
      }
    },
    // stable deps — eslint-disable-next-line react-hooks/exhaustive-deps
    [stopCameraStream]
  );

  // Called when user uploads photos via PhotoChoice (no camera)
  const handleUploadComplete = useCallback(
    (urls: string[]) => {
      setPhotoUrls(urls);
      trackEvent("onboarding_photos_uploaded");
      // Kick off character sheet generation immediately
      startCharacterSheetGeneration([]);
      setStep("voice");
    },
    // stable deps — eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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
      // Video generation already started in the background via useEffect
      // when character sheets completed. No action needed here.
    },
    []
  );

  // ── Render ──

  const { heading, sub } = STEP_CONTENT[step];

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
                    Take a quick photo, clone your voice, and we&apos;ll build an AI twin that creates content for you — on autopilot.
                  </p>
                  <div className="flex items-center justify-center gap-4 text-[12px] text-white/30 pt-1">
                    <span className="flex items-center gap-1"><span>📸</span> 1 photo</span>
                    <span className="flex items-center gap-1"><span>🎙️</span> 30s audio</span>
                    <span className="flex items-center gap-1"><span>⏱️</span> ~1 min</span>
                  </div>
                </div>

                <button
                  onClick={() => setStep("photo_choice")}
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

            {/* ── Single photo capture ── */}
            {step === "photo_capture" && (
              <motion.div
                key="photo_capture"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <ExpressionCapture
                  expression={{ emoji: "📸", label: "Look straight at the camera" }}
                  cameraStream={cameraStream}
                  uploading={uploading}
                  onCapture={handleSingleCapture}
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
