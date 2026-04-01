"use client";

import { useState, useEffect, useRef } from "react";
import { Play, ArrowRight, Loader2, Zap, Star, TrendingUp, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FEATURES = [
  { icon: "🎭", text: "AI digital twin from 1 photo" },
  { icon: "🎙️", text: "Voice cloned in 5 seconds" },
  { icon: "📱", text: "Auto-posts to every platform" },
  { icon: "📅", text: "Content calendar fills itself" },
  { icon: "📊", text: "Analytics that tell you what works" },
  { icon: "♾️", text: "30 videos/month, every month" },
];

const SOCIAL_PROOF = [
  { name: "Sarah K.", role: "Real estate agent", quote: "First video got 12k views. I was floored.", avatar: "SK" },
  { name: "Marcus T.", role: "Attorney", quote: "My competitors have no idea how I'm doing this.", avatar: "MT" },
];

interface PaywallStepProps {
  videoUrl?: string;
  videoGenerating?: boolean;
}

function trackEvent(event: string) {
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  }).catch(() => {});
}

export default function PaywallStep({ videoUrl, videoGenerating }: PaywallStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Track paywall view once on mount
  useEffect(() => { trackEvent("onboarding_paywall_viewed"); }, []);

  const handleSubscribe = async () => {
    trackEvent("onboarding_trial_started");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      });

      if (res.status === 401) {
        window.location.href = "/auth/signup";
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        await fetch("/api/onboarding/complete", { method: "POST" }).catch(() => {});
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Something went wrong — please try again");
      setLoading(false);
    }
  };

  const skipToDashboard = async () => {
    trackEvent("onboarding_skipped");
    setLoading(true);
    await fetch("/api/onboarding/complete", { method: "POST" }).catch(() => {});
    window.location.href = "/dashboard";
  };

  return (
    <div className="w-full max-w-sm mx-auto space-y-5">

      {/* Video preview */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-2xl overflow-hidden aspect-[9/16] max-h-[480px] bg-black/40 border border-white/[0.08]"
      >
        {videoGenerating && !videoUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <motion.div
              className="w-10 h-10 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
            <p className="text-[13px] font-semibold text-white/50">Rendering your first video...</p>
            <p className="text-[11px] text-white/25">Your face. Your voice. Almost ready.</p>
          </div>
        )}

        {videoUrl && (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
              playsInline
              muted
              autoPlay
              loop
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              onError={(e) => console.error("[PaywallStep] Video failed to load:", videoUrl, e)}
              onClick={() => {
                if (videoRef.current?.paused) videoRef.current.play();
                else videoRef.current?.pause();
              }}
            />
            {!videoPlaying && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                onClick={() => videoRef.current?.play()}
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center"
                >
                  <Play className="w-6 h-6 text-white ml-0.5" />
                </motion.div>
              </div>
            )}
          </>
        )}

        {!videoGenerating && !videoUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-[13px] font-bold text-white">Your AI twin is ready</p>
            <p className="text-[11px] text-white/40">Video preview coming soon</p>
          </div>
        )}
      </motion.div>

      {/* Main pricing card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-3xl overflow-hidden"
      >
        {/* Gradient border via box shadow */}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none z-10"
          style={{
            boxShadow: "inset 0 0 0 1.5px rgba(99,102,241,0.3)",
          }}
        />

        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/8 via-[#060610] to-violet-500/6" />
        <motion.div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 70% 20%, rgba(99,102,241,0.12) 0%, transparent 60%)" }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-400/25">
                  <Zap className="w-3 h-3 text-indigo-300" />
                  <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wide">
                    7 days free
                  </span>
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[40px] font-black text-white leading-none">$79</span>
                <span className="text-[14px] text-white/30 font-medium">/mo after</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <span className="text-[11px] text-white/25">4.9 · 200+ users</span>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 gap-2">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
                className="flex items-center gap-2.5"
              >
                <span className="text-[15px]">{f.icon}</span>
                <span className="text-[13px] text-white/55 font-medium">{f.text}</span>
              </motion.div>
            ))}
          </div>

          {/* ROI callout */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15"
          >
            <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p className="text-[12px] text-emerald-300/80 font-medium">
              One closed deal pays for <span className="font-bold text-emerald-300">years</span> of Official AI
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* Social proof */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="grid grid-cols-2 gap-2.5"
      >
        {SOCIAL_PROOF.map((sp, i) => (
          <div
            key={i}
            className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-3.5 space-y-2"
          >
            <p className="text-[12px] text-white/50 leading-relaxed italic">
              &ldquo;{sp.quote}&rdquo;
            </p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                <span className="text-[8px] font-bold text-white">{sp.avatar}</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-white/60">{sp.name}</p>
                <p className="text-[10px] text-white/25">{sp.role}</p>
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="space-y-3"
      >
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[13px] text-red-400/80 text-center"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          onClick={handleSubscribe}
          disabled={loading}
          whileHover={!loading ? { scale: 1.02 } : {}}
          whileTap={!loading ? { scale: 0.97 } : {}}
          className="relative w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-[16px] font-black text-white overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #06b6d4 100%)",
            boxShadow: "0 0 30px rgba(99,102,241,0.4), 0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          {/* Shimmer */}
          {!loading && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12 pointer-events-none"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.5 }}
            />
          )}
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <span>Start free trial</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>

        <div className="flex items-center justify-center gap-2">
          <Clock className="w-3 h-3 text-white/20" />
          <p className="text-[12px] text-white/25">
            Free for 7 days. No charge today. Cancel anytime.
          </p>
        </div>

        <button
          onClick={skipToDashboard}
          disabled={loading}
          className="w-full py-2 text-[12px] text-white/15 hover:text-white/30 transition-colors"
        >
          Skip for now →
        </button>
      </motion.div>
    </div>
  );
}
