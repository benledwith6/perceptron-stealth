"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Play, Pause, RotateCcw, Upload, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type RecorderState = "idle" | "recording" | "preview" | "uploading" | "done";

interface VoiceRecorderProps {
  onSaved?: (voiceSampleId: string) => void;
  onSkip?: () => void;
}

const RECORD_DURATION = 22; // seconds

const SCRIPT_TEXT =
  "Hi there! My name is... and I'm excited to share my story with you today. Whether you're looking for expert advice, fresh ideas, or just a friendly conversation — I'm here to help. Let's get started and make something amazing together.";

export default function VoiceRecorder({ onSaved, onSkip }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [timeLeft, setTimeLeft] = useState(RECORD_DURATION);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ─── Start Recording ─────────────────────────────────────────────

  const startRecording = async () => {
    setError(null);

    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Your browser doesn't support audio recording. Please use a modern browser like Chrome, Firefox, or Safari.");
      return;
    }

    // Check permission status first if the API is available
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (permStatus.state === "denied") {
          setError("Microphone access is blocked. To fix this, click the lock icon in your browser's address bar and allow microphone access, then reload the page.");
          return;
        }
      }
    } catch {
      // permissions.query may not support "microphone" in all browsers — continue to getUserMedia
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setState("preview");
        stopStream();
      };

      mediaRecorder.start(250); // collect data every 250ms
      setState("recording");
      setTimeLeft(RECORD_DURATION);

      // Countdown timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, RECORD_DURATION - elapsed);
        setTimeLeft(Math.ceil(remaining));

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          mediaRecorder.stop();
        }
      }, 200);
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Microphone access denied. To fix this, click the lock icon in your browser's address bar, allow microphone access, then reload the page.");
      } else if (err.name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone and try again.");
      } else {
        setError("Could not access microphone. Please check your device settings.");
      }
    }
  };

  // ─── Stop Recording Early ────────────────────────────────────────

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  // ─── Re-record ──────────────────────────────────────────────────

  const reRecord = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBlob(null);
    setIsPlaying(false);
    setState("idle");
    setTimeLeft(RECORD_DURATION);
  };

  // ─── Playback ───────────────────────────────────────────────────

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // ─── Save / Upload ──────────────────────────────────────────────

  const handleSave = async () => {
    if (!audioBlob) return;
    setState("uploading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "voice-recording.webm");
      formData.append("type", "voice");

      const res = await fetch("/api/upload", { method: "POST", body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setState("done");
      onSaved?.(data.recordId);
    } catch (err: any) {
      setError(err.message || "Failed to save voice recording");
      setState("preview"); // let them retry
    }
  };

  // ─── Progress ring for countdown ────────────────────────────────

  const progress = 1 - timeLeft / RECORD_DURATION;
  const circumference = 2 * Math.PI * 54; // radius 54

  return (
    <div className="flex flex-col items-center">
      {/* Script Card */}
      <div className="w-full max-w-md mb-8">
        <div className="px-5 py-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div className="text-[11px] uppercase tracking-wider text-white/20 mb-2">
            Read this aloud
          </div>
          <p className="text-[15px] leading-relaxed text-white/60 italic">
            &ldquo;{SCRIPT_TEXT}&rdquo;
          </p>
        </div>
      </div>

      {/* Record Button / Status */}
      <div className="relative flex items-center justify-center mb-6">
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.button
              key="idle"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={startRecording}
              className="relative w-28 h-28 rounded-full flex items-center justify-center group"
            >
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border-2 border-red-500/30 group-hover:border-red-500/50 transition-colors" />
              {/* Inner circle */}
              <div className="w-20 h-20 rounded-full bg-red-500/90 group-hover:bg-red-500 flex items-center justify-center transition-colors shadow-lg shadow-red-500/20">
                <Mic className="w-8 h-8 text-white" />
              </div>
            </motion.button>
          )}

          {state === "recording" && (
            <motion.div
              key="recording"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-28 h-28 flex items-center justify-center"
            >
              {/* Progress ring */}
              <svg className="absolute inset-0 -rotate-90" width="112" height="112" viewBox="0 0 112 112">
                <circle
                  cx="56" cy="56" r="54"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="3"
                />
                <motion.circle
                  cx="56" cy="56" r="54"
                  fill="none"
                  stroke="rgba(239,68,68,0.8)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                />
              </svg>

              {/* Pulsing background */}
              <motion.div
                className="absolute w-20 h-20 rounded-full bg-red-500/20"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Stop button */}
              <button
                onClick={stopRecording}
                className="relative w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30"
              >
                <Square className="w-6 h-6 text-white fill-white" />
              </button>

              {/* Timer */}
              <div className="absolute -bottom-8 text-[14px] font-mono text-white/60 tabular-nums">
                {timeLeft}s
              </div>
            </motion.div>
          )}

          {(state === "preview" || state === "uploading" || state === "done") && (
            <motion.div
              key="preview"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-28 h-28 rounded-full border-2 border-white/[0.08] flex items-center justify-center"
            >
              {state === "done" ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center"
                >
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
              ) : (
                <button
                  onClick={togglePlayback}
                  disabled={state === "uploading"}
                  className="w-20 h-20 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  {isPlaying ? (
                    <Pause className="w-7 h-7 text-white/70" />
                  ) : (
                    <Play className="w-7 h-7 text-white/70 ml-1" />
                  )}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hidden audio element for playback */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* State label */}
      <div className="text-[13px] text-white/30 mb-6 h-5">
        {state === "idle" && "Tap to start recording"}
        {state === "recording" && "Recording... read the script above"}
        {state === "preview" && "Listen to your recording"}
        {state === "uploading" && "Saving your voice..."}
        {state === "done" && "Voice saved!"}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        {state === "preview" && (
          <>
            <button
              onClick={reRecord}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.06] text-[13px] text-white/50 hover:bg-white/[0.03] transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Re-record
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#050508] text-[13px] font-medium hover:bg-white/90 transition-all"
            >
              <Upload className="w-3.5 h-3.5" /> Save & Continue
            </button>
          </>
        )}

        {state === "uploading" && (
          <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-[13px] text-white/50">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-400/80 max-w-md text-center"
        >
          {error}
        </motion.div>
      )}

      {/* Skip */}
      {state !== "done" && state !== "uploading" && onSkip && (
        <button
          onClick={onSkip}
          className="mt-6 text-[12px] text-white/20 hover:text-white/40 transition-colors"
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
