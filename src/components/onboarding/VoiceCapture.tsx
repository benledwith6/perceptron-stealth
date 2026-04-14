"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Play, Pause, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface VoiceCaptureProps {
  onCapture: (audioBlob: Blob) => void;
  uploading?: boolean;
}

const SAMPLE_SCRIPTS = [
  "One of my favorite shows to talk about is Ted Lasso. On the surface, it's a comedy about an American football coach who somehow ends up leading a Premier League soccer team in England. But under the jokes, it's really a show about kindness, curiosity, and choosing optimism even when you're losing. That's why it stuck with me — it treats being a good person like a superpower, not a weakness.",
  "The real estate market is shifting fast right now. Interest rates moved three times this year, inventory tightened in the spring, and buyers are more cautious than they've been in a decade. If you're thinking about buying or selling, the best time to talk to an expert is before you need one. I'd rather have an honest fifteen-minute conversation today than watch you overpay next month.",
  "In my years of practice, I've learned that the best outcomes almost always come from preparation, not performance. Every case tells a story — dates, decisions, the small moments that add up — and our job is to tell it clearly enough that a judge, a jury, or the other side actually understands what happened. If we do that well, settlements get easier and trials get shorter.",
  "Good morning! I help business owners grow by showing them the numbers they haven't been looking at. Data tells you the what. Strategy tells you the why. And honest results — the kind you can measure six weeks later — tell you whether it actually worked. I don't believe in guessing, I don't believe in vibes, and I definitely don't believe in charging you for either.",
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VoiceCapture({ onCapture, uploading = false }: VoiceCaptureProps) {
  const [mode, setMode] = useState<"prompt" | "recording" | "preview">("prompt");
  const [scriptIndex, setScriptIndex] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [micError, setMicError] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(new Array(24).fill(0.1));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [audioUrl]);

  const startRecording = useCallback(async () => {
    setMicError(false);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for waveform visualization
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setDuration(elapsed);
        setMode("preview");
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      };

      recorder.start(250);
      setMode("recording");
      setElapsed(0);

      // Timer
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      // Waveform animation
      const updateWaveform = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const bars = Array.from({ length: 24 }, (_, i) => {
          const idx = Math.floor((i / 24) * data.length);
          return Math.max(0.08, data[idx] / 255);
        });
        setWaveform(bars);
        animFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();
    } catch {
      setMicError(true);
    }
  }, [elapsed]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
  }, []);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      setIsPlaying(true);
      audioRef.current.onended = () => setIsPlaying(false);
    }
  }, [isPlaying, audioUrl]);

  const reRecord = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);
    setDuration(0);
    setIsPlaying(false);
    setWaveform(new Array(24).fill(0.1));
    setMode("prompt");
  }, [audioUrl]);

  const confirm = useCallback(() => {
    if (audioBlob) onCapture(audioBlob);
  }, [audioBlob, onCapture]);

  const tooShort = duration < 5;

  return (
    <div className="w-full max-w-sm mx-auto">
      <audio ref={audioRef} className="hidden" />

      <AnimatePresence mode="wait">

        {/* -- Script prompt -- */}
        {mode === "prompt" && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-5"
          >
            {/* Script card */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-white/30 uppercase tracking-[0.12em]">
                  Read this aloud
                </p>
                <button
                  onClick={() => setScriptIndex((i) => (i + 1) % SAMPLE_SCRIPTS.length)}
                  className="text-[11px] text-indigo-400/60 hover:text-indigo-400 transition-colors font-medium"
                >
                  Different script
                </button>
              </div>
              <p className="text-[14px] text-white/70 leading-relaxed font-medium">
                &ldquo;{SAMPLE_SCRIPTS[scriptIndex]}&rdquo;
              </p>
              <p className="text-[11px] text-white/20">~30 seconds is ideal. 5 seconds minimum.</p>
            </div>

            {/* Record button */}
            <motion.button
              onClick={startRecording}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="group relative w-full overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-violet-500/8 to-transparent p-5 flex items-center gap-4 transition-all hover:border-indigo-400/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)]"
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />

              <div className="relative flex-shrink-0">
                <motion.div
                  className="absolute inset-0 rounded-xl bg-red-500/30"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                  <Mic className="w-5 h-5 text-white" />
                </div>
              </div>

              <div className="text-left z-10">
                <p className="text-[15px] font-bold text-white">Start recording</p>
                <p className="text-[12px] text-indigo-300/60 mt-0.5">
                  Tap and read the script above
                </p>
              </div>

              <div className="ml-auto z-10">
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-[10px] text-white/40">{"\u2192"}</span>
                </div>
              </div>
            </motion.button>

            {micError && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <p className="text-[12px] text-amber-400/80">
                  Microphone blocked. Check your browser permissions.
                </p>
              </motion.div>
            )}

            <p className="text-[11px] text-white/20 text-center">
              Your voice is cloned locally and never shared with third parties.
            </p>
          </motion.div>
        )}

        {/* -- Recording -- */}
        {mode === "recording" && (
          <motion.div
            key="recording"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-5"
          >
            {/* Script reference */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4">
              <p className="text-[13px] text-white/50 leading-relaxed">
                &ldquo;{SAMPLE_SCRIPTS[scriptIndex]}&rdquo;
              </p>
            </div>

            {/* Waveform visualization */}
            <div className="relative rounded-2xl bg-black/30 border border-red-500/20 p-6 flex flex-col items-center gap-4">
              {/* Live indicator */}
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2.5 h-2.5 rounded-full bg-red-500"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-[13px] font-bold text-red-400">Recording</span>
                <span className="text-[13px] font-mono text-white/40">{formatTime(elapsed)}</span>
              </div>

              {/* Waveform bars */}
              <div className="flex items-end gap-[3px] h-16 w-full justify-center">
                {waveform.map((v, i) => (
                  <motion.div
                    key={i}
                    className="w-[6px] rounded-full bg-gradient-to-t from-red-500 to-rose-400"
                    animate={{ height: `${v * 100}%` }}
                    transition={{ duration: 0.1 }}
                    style={{ minHeight: 4 }}
                  />
                ))}
              </div>

              {/* Stop button */}
              <motion.button
                onClick={stopRecording}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-[0_0_25px_rgba(239,68,68,0.5)]"
              >
                <Square className="w-5 h-5 text-white fill-white" />
              </motion.button>

              <p className="text-[11px] text-white/25">Tap to stop</p>
            </div>
          </motion.div>
        )}

        {/* -- Preview -- */}
        {mode === "preview" && audioUrl && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            {/* Playback card */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-indigo-400" />
                  <span className="text-[14px] font-semibold text-white/70">Your recording</span>
                </div>
                <span className="text-[13px] font-mono text-white/30">{formatTime(duration)}</span>
              </div>

              {/* Playback button + static waveform */}
              <div className="flex items-center gap-3">
                <motion.button
                  onClick={togglePlayback}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 text-indigo-300" />
                  ) : (
                    <Play className="w-4 h-4 text-indigo-300 ml-0.5" />
                  )}
                </motion.button>
                <div className="flex items-end gap-[2px] h-8 flex-1">
                  {waveform.map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-full bg-indigo-500/40"
                      style={{ height: `${Math.max(12, v * 100)}%` }}
                    />
                  ))}
                </div>
              </div>

              {/* Quality badge */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold ${
                  tooShort
                    ? "bg-amber-500/10 border border-amber-500/20 text-amber-300"
                    : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                }`}
              >
                {tooShort ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    Too short. Record at least 5 seconds for good quality.
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 flex-shrink-0" />
                    Sounds great. Ready to clone.
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={reRecord}
                className="flex items-center justify-center gap-1.5 flex-1 py-3.5 rounded-xl border border-white/[0.08] text-[13px] font-medium text-white/35 hover:text-white/55 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-record
              </button>

              <motion.button
                onClick={confirm}
                disabled={uploading || tooShort}
                whileHover={!uploading && !tooShort ? { scale: 1.02 } : {}}
                whileTap={!uploading && !tooShort ? { scale: 0.97 } : {}}
                className="flex items-center justify-center gap-2 flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {uploading ? (
                  <motion.div
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Clone my voice
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
