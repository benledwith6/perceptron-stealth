"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { X, Volume2, VolumeX } from "lucide-react";

interface VideoModalProps {
  src: string;
  title?: string;
  audioSrc?: string;
  onClose: () => void;
}

export default function VideoModal({
  src,
  title,
  audioSrc,
  onClose,
}: VideoModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  const handleClose = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      // Ensure audio/video stop on unmount
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, [handleClose]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) {
      handleClose();
    }
  }

  function handlePlay() {
    if (audioRef.current && videoRef.current) {
      audioRef.current.currentTime = videoRef.current.currentTime;
      if (!isMuted) {
        audioRef.current.play().catch(() => {});
      }
    }
  }

  function handlePause() {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }

  function handleSeeked() {
    if (audioRef.current && videoRef.current) {
      audioRef.current.currentTime = videoRef.current.currentTime;
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    const next = !isMuted;
    video.muted = next;
    setIsMuted(next);
    if (audioRef.current) {
      audioRef.current.muted = next;
      if (!next && !video.paused) {
        audioRef.current.currentTime = video.currentTime;
        audioRef.current.play().catch(() => {});
      }
    }
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <div className="relative flex flex-col items-center max-h-[90vh] w-full max-w-[90vw] sm:w-auto">
        {/* Header */}
        <div className="w-full flex items-center justify-between mb-4 px-1">
          {title ? (
            <h2 className="text-sm font-medium text-white/70 truncate mr-4">
              {title}
            </h2>
          ) : (
            <div />
          )}
          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Video container -- 9:16 aspect ratio */}
        <div className="relative rounded-xl overflow-hidden bg-black w-full sm:w-auto" style={{ aspectRatio: "9/16", maxHeight: "75vh" }}>
          <video
            ref={videoRef}
            src={src}
            controls
            autoPlay
            muted
            playsInline
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeked={handleSeeked}
            className="w-full h-full object-contain"
          />
          {/* Unmute button -- always visible on mobile, hover on desktop */}
          <button
            onClick={toggleMute}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center sm:opacity-0 sm:hover:opacity-100 sm:focus:opacity-100 opacity-100 transition-opacity duration-200 hover:bg-black/80 active:bg-black/90 z-10"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-white/80" />
            ) : (
              <Volume2 className="w-4 h-4 text-white/80" />
            )}
          </button>
        </div>

        {audioSrc && (
          <audio ref={audioRef} src={audioSrc} preload="auto" />
        )}
      </div>
    </div>
  );
}
