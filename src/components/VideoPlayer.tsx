"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  audioSrc?: string;
}

export default function VideoPlayer({
  src,
  poster,
  className = "",
  autoPlay = false,
  audioSrc,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(autoPlay);
  const [muted, setMuted] = useState(true);

  const syncAudio = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    audio.currentTime = video.currentTime;
    if (playing && !muted) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [playing, muted]);

  useEffect(() => {
    syncAudio();
  }, [syncAudio]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (autoPlay) {
      video.play().catch(() => {});
    }
  }, [autoPlay]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;

    const next = !muted;
    video.muted = next;
    setMuted(next);

    if (audioRef.current) {
      audioRef.current.muted = next;
    }
  }

  function handleVideoEnd() {
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }

  return (
    <div className={`relative group bg-black rounded-xl overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={muted}
        playsInline
        onClick={togglePlay}
        onEnded={handleVideoEnd}
        className="w-full h-full object-contain cursor-pointer"
      />

      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} preload="auto" />
      )}

      {/* Play/Pause overlay */}
      <div
        onClick={togglePlay}
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 cursor-pointer ${
          playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"
        }`}
      >
        <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center transition-transform duration-200 hover:scale-110 active:scale-95">
          {playing ? (
            <Pause className="w-7 h-7 text-white" />
          ) : (
            <Play className="w-7 h-7 text-white ml-0.5" />
          )}
        </div>
      </div>

      {/* Mute button -- always visible on mobile, hover on desktop */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleMute();
        }}
        className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70 active:bg-black/90"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? (
          <VolumeX className="w-4 h-4 text-white/80" />
        ) : (
          <Volume2 className="w-4 h-4 text-white/80" />
        )}
      </button>
    </div>
  );
}
