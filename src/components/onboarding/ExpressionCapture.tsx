"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";

interface ExpressionCaptureProps {
  expression: { emoji: string; label: string };
  onCapture: (file: File, previewUrl: string) => void;
  uploading?: boolean;
  cameraStream?: MediaStream | null;
}

export default function ExpressionCapture({
  expression,
  onCapture,
  uploading = false,
  cameraStream,
}: ExpressionCaptureProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stream = cameraStream || localStream;

  // Start local camera if no shared stream provided
  useEffect(() => {
    if (cameraStream) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!cancelled) setLocalStream(s);
      } catch {
        // Parent should handle camera denied
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cameraStream]);

  // Attach stream to video element
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => setCameraReady(true);
    }
  }, [stream]);

  // Cleanup only local stream
  useEffect(() => {
    return () => {
      if (!cameraStream && localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [localStream, cameraStream]);

  const snap = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror front-facing camera
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `expression-${expression.label}-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      const url = URL.createObjectURL(blob);
      onCapture(file, url);
    }, "image/jpeg", 0.92);
  }, [expression.label, onCapture]);

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* Expression prompt */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="text-center"
      >
        <motion.span
          className="text-6xl block"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {expression.emoji}
        </motion.span>
        <p className="text-[18px] font-bold text-white mt-3">{expression.label}</p>
      </motion.div>

      {/* Camera viewfinder */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="relative rounded-3xl overflow-hidden bg-black aspect-[3/4] shadow-[0_0_40px_rgba(99,102,241,0.2)]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-500 ${
              cameraReady ? "opacity-100" : "opacity-0"
            }`}
          />
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/[0.02]">
              <motion.div
                className="w-10 h-10 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            </div>
          )}

          {/* Gradient border ring */}
          <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/[0.08] pointer-events-none" />

          {/* Face oval guide */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              className="w-36 h-48 rounded-full border-2 border-white/25 border-dashed"
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      </motion.div>

      {/* Capture button */}
      <motion.button
        onClick={snap}
        disabled={!cameraReady || uploading}
        whileHover={cameraReady ? { scale: 1.02 } : {}}
        whileTap={cameraReady ? { scale: 0.95 } : {}}
        className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[15px] font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {uploading ? (
          <motion.div
            className="w-5 h-5 mx-auto border-2 border-white/30 border-t-white rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          />
        ) : (
          "📸 Capture"
        )}
      </motion.button>
    </div>
  );
}
