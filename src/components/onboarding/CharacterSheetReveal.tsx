"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Check, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CharacterSheetRevealProps {
  photoUrl: string;
  industry: string;
  onSelect: (poseUrl: string, sheetId: string) => void;
  /** Pre-fetched composite URL from background generation */
  preloadedCompositeUrl?: string | null;
  /** Pre-fetched sheet ID from background generation */
  preloadedSheetId?: string | null;
  /** External signal that generation is already in progress */
  isGenerating?: boolean;
}

const LOADING_STAGES = [
  { copy: "Scanning your face... 👁️", sub: "Mapping 68 facial landmarks" },
  { copy: "Generating your twin... 🧬", sub: "Building from the ground up" },
  { copy: "Styling your looks... ✨", sub: "9 professional poses incoming" },
  { copy: "Adding the magic... 🔮", sub: "This one always gets people" },
  { copy: "Almost there... 🎯", sub: "Worth the wait, we promise" },
];

type RevealState = "loading" | "reveal" | "error";

// ── Confetti burst ────────────────────────────────────────────────────
interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  vx: number;
  vy: number;
  rotation: number;
  shape: "rect" | "circle" | "star";
}

const COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ec4899","#ffffff"];

function ConfettiBurst({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) return;
    const burst: Particle[] = Array.from({ length: 60 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 60 + (Math.random() - 0.5) * 0.5;
      const speed = 80 + Math.random() * 120;
      return {
        id: i,
        x: 50,
        y: 40,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 4 + Math.random() * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        rotation: Math.random() * 360,
        shape: (["rect","circle","star"] as const)[Math.floor(Math.random() * 3)],
      };
    });
    setParticles(burst);
    const t = setTimeout(() => setParticles([]), 2200);
    return () => clearTimeout(t);
  }, [active]);

  if (!particles.length) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" aria-hidden>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.shape === "circle" ? p.size : p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: p.shape === "circle" ? "50%" : p.shape === "star" ? "2px" : "1px",
            transform: `rotate(${p.rotation}deg)`,
          }}
          animate={{
            x: p.vx,
            y: p.vy + 200,
            opacity: [1, 1, 0],
            rotate: p.rotation + (Math.random() > 0.5 ? 360 : -360),
          }}
          transition={{ duration: 1.8 + Math.random() * 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      ))}
    </div>
  );
}

export default function CharacterSheetReveal({
  photoUrl,
  industry,
  onSelect,
  preloadedCompositeUrl,
  preloadedSheetId,
  isGenerating,
}: CharacterSheetRevealProps) {
  const [state, setState] = useState<RevealState>("loading");
  const [stageIndex, setStageIndex] = useState(0);
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const hasFetched = useRef(false);
  const elapsed = useRef(0);

  // Progress through loading stages
  useEffect(() => {
    if (state !== "loading") return;
    const interval = setInterval(() => {
      elapsed.current += 1;
      setStageIndex((i) => Math.min(i + 1, LOADING_STAGES.length - 1));
    }, 1600);
    return () => clearInterval(interval);
  }, [state]);

  const generate = useCallback(async () => {
    hasFetched.current = true;
    setState("loading");
    setErrorMsg(null);
    setStageIndex(0);
    elapsed.current = 0;
    setImageLoaded(false);

    try {
      const res = await fetch("/api/character-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls: [photoUrl], industry }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      const url = data.poses?.compositeUrl;
      const id = data.poses?.id;
      if (!url) throw new Error("No character sheet generated");

      setCompositeUrl(url);
      setSheetId(id || null);
      setState("reveal");
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setState("error");
    } finally {
      setRetrying(false);
    }
  }, [photoUrl, industry]);

  // If preloaded data is provided, skip fetch and go straight to reveal
  useEffect(() => {
    if (preloadedCompositeUrl) {
      setCompositeUrl(preloadedCompositeUrl);
      setSheetId(preloadedSheetId || null);
      setState("reveal");
      hasFetched.current = true;
    }
  }, [preloadedCompositeUrl, preloadedSheetId]);

  // If external generation is signaled but no URL yet, stay in loading
  useEffect(() => {
    if (isGenerating && !preloadedCompositeUrl) {
      setState("loading");
      hasFetched.current = true;
    }
  }, [isGenerating, preloadedCompositeUrl]);

  useEffect(() => {
    if (!hasFetched.current && !preloadedCompositeUrl && !isGenerating) generate();
  }, [generate, preloadedCompositeUrl, isGenerating]);

  const handleImageLoad = () => {
    setImageLoaded(true);
    // Fire confetti after image appears
    setTimeout(() => setConfetti(true), 400);
  };

  const handleSelect = () => {
    setSelected(true);
  };

  const handleConfirm = () => {
    if (compositeUrl) onSelect(compositeUrl, sheetId || "");
  };

  const handleRetry = () => {
    setRetrying(true);
    hasFetched.current = false;
    setSelected(false);
    setCompositeUrl(null);
    setConfetti(false);
    generate();
  };

  const currentStage = LOADING_STAGES[stageIndex];

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">

        {/* ── Loading ── */}
        {state === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-7 py-6"
          >
            {/* Central orb */}
            <div className="relative w-24 h-24">
              {/* Outer rings */}
              <motion.div
                className="absolute inset-0 rounded-full border border-indigo-500/20"
                animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute inset-0 rounded-full border border-violet-500/20"
                animate={{ scale: [1, 2.0, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
              />
              {/* Core glow */}
              <motion.div
                className="absolute inset-4 rounded-full"
                style={{
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)",
                  boxShadow: "0 0 40px rgba(99,102,241,0.5), 0 0 80px rgba(139,92,246,0.3)",
                }}
                animate={{
                  scale: [1, 1.1, 1],
                  boxShadow: [
                    "0 0 40px rgba(99,102,241,0.5), 0 0 80px rgba(139,92,246,0.3)",
                    "0 0 60px rgba(99,102,241,0.7), 0 0_100px rgba(139,92,246,0.4)",
                    "0 0 40px rgba(99,102,241,0.5), 0 0 80px rgba(139,92,246,0.3)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              {/* Photo preview inside orb */}
              {photoUrl && (
                <div className="absolute inset-4 rounded-full overflow-hidden opacity-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {/* Animated stage copy */}
            <div className="text-center space-y-1.5 h-12">
              <AnimatePresence mode="wait">
                <motion.p
                  key={stageIndex}
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                  transition={{ duration: 0.45 }}
                  className="text-[17px] font-bold text-white"
                >
                  {currentStage.copy}
                </motion.p>
              </AnimatePresence>
              <AnimatePresence mode="wait">
                <motion.p
                  key={stageIndex + "sub"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="text-[13px] text-white/30"
                >
                  {currentStage.sub}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)" }}
                animate={{
                  width: [`${(stageIndex / (LOADING_STAGES.length - 1)) * 85}%`, `${((stageIndex + 0.9) / (LOADING_STAGES.length - 1)) * 85}%`],
                }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />
            </div>

            {/* Floating dots */}
            <div className="flex items-center gap-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: i === stageIndex ? 20 : 6,
                    height: 6,
                    backgroundColor: i <= stageIndex ? "#6366f1" : "rgba(255,255,255,0.1)",
                  }}
                  animate={{ width: i === stageIndex ? 20 : 6 }}
                  transition={{ duration: 0.3 }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Reveal ── */}
        {state === "reveal" && compositeUrl && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <motion.p
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className="text-[26px] font-extrabold text-white tracking-tight"
              >
                Looks like you?? 🤯
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-[13px] text-white/40 mt-1.5 font-medium"
              >
                9 poses. 1 photo. Built just for you.
              </motion.p>
            </motion.div>

            {/* Character sheet — with confetti */}
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.7, type: "spring", stiffness: 120, damping: 16 }}
              className="relative"
            >
              {/* Glow behind the image */}
              <div className="absolute -inset-4 rounded-3xl opacity-60"
                style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.2) 0%, transparent 70%)" }}
              />

              <div
                className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-300 cursor-pointer ${
                  selected
                    ? "border-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.4)]"
                    : "border-white/[0.08] hover:border-indigo-500/40 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                }`}
                onClick={handleSelect}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={compositeUrl}
                  alt="Your AI character sheet"
                  className={`w-full h-auto transition-opacity duration-500 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                  onLoad={handleImageLoad}
                />

                {!imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/[0.02]">
                    <motion.div
                      className="w-8 h-8 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                )}

                {/* Confetti burst */}
                <ConfettiBurst active={confetti} />

                {/* Selection overlay */}
                <AnimatePresence>
                  {selected && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-indigo-500/5 pointer-events-none"
                    >
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.6)]"
                      >
                        <Check className="w-5 h-5 text-white" />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Tap hint */}
                {!selected && imageLoaded && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="absolute bottom-0 inset-x-0 p-3 flex justify-center"
                    style={{ background: "linear-gradient(to top, rgba(6,6,16,0.85), transparent)" }}
                  >
                    <motion.span
                      animate={{ y: [0, -2, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className="text-[12px] font-semibold text-white/60 bg-white/[0.08] backdrop-blur-md px-3 py-1.5 rounded-full border border-white/[0.10]"
                    >
                      👆 Tap to select this look
                    </motion.span>
                  </motion.div>
                )}
              </div>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="space-y-2.5"
            >
              <motion.button
                onClick={handleConfirm}
                disabled={!selected}
                whileHover={selected ? { scale: 1.02 } : {}}
                whileTap={selected ? { scale: 0.97 } : {}}
                className="relative w-full py-4 rounded-2xl text-[15px] font-bold overflow-hidden disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
                style={selected ? {
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)",
                  boxShadow: "0 0 30px rgba(99,102,241,0.4)",
                } : {
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {/* Shimmer on active */}
                {selected && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12"
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
                  />
                )}
                <span className="relative text-white">
                  {selected ? "Let's go 🚀" : "Tap your sheet to select it"}
                </span>
              </motion.button>

              <button
                onClick={handleRetry}
                disabled={retrying}
                className="w-full py-2.5 text-[12px] font-medium text-white/25 hover:text-white/45 transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} />
                Not feeling it? Regenerate
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ── Error ── */}
        {state === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5 py-8 text-center"
          >
            <motion.div
              animate={{ rotate: [0, -5, 5, -5, 0] }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-5xl"
            >
              😬
            </motion.div>
            <div>
              <p className="text-[17px] font-bold text-white/80">Generation glitched</p>
              <p className="text-[13px] text-white/30 mt-1">{errorMsg}</p>
            </div>
            <motion.button
              onClick={handleRetry}
              disabled={retrying}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/[0.06] border border-white/[0.10] text-[14px] font-semibold text-white/70 hover:text-white hover:bg-white/[0.09] transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
              Try again
            </motion.button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
