"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  Film,
  Cpu,
  Clock,
  FileText,
  Tag,
  Volume2,
  VolumeX,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
  description: string | null;
  script: string | null;
  model: string;
  status: string;
  contentType: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  duration: number;
  createdAt: string;
  schedule?: { platform: string } | null;
}

interface VideoDetailModalProps {
  video: VideoItem;
  onClose: () => void;
  onStatusChange: (id: string, newStatus: string) => void;
  onRetry?: (id: string) => void;
  errorMessage?: string;
}

const statusStyles: Record<string, string> = {
  published: "bg-green-500/10 text-green-400 border-green-500/20",
  review: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  draft: "bg-white/[0.06] text-white/40 border-white/[0.06]",
  generating: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
};

const modelLabels: Record<string, string> = {
  "kling_2.6": "Kling 2.6",
  "seedance_2.0": "Seedance 2.0",
  sora_2: "Sora 2",
};

function formatDuration(seconds: number): string {
  if (!seconds) return "0:08";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatContentType(ct: string): string {
  return ct
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function VideoDetailModal({
  video,
  onClose,
  onStatusChange,
  onRetry,
  errorMessage,
}: VideoDetailModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [updating, setUpdating] = useState(false);
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  function toggleMute() {
    const vid = videoRef.current;
    if (!vid) return;
    const next = !isMuted;
    vid.muted = next;
    setIsMuted(next);
  }

  const handleClose = useCallback(() => {
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
      // Ensure video stops on unmount
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

  async function handleStatusUpdate(newStatus: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        onStatusChange(video.id, newStatus);
      }
    } catch {
      // silent fail
    } finally {
      setUpdating(false);
    }
  }

  const scriptText = video.script || "";
  const scriptIsLong = scriptText.length > 300;
  const displayScript = scriptExpanded
    ? scriptText
    : scriptText.substring(0, 300);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0c0f1a] border border-white/[0.06] shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 backdrop-blur border border-white/10 flex items-center justify-center hover:bg-white/10 active:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4 text-white/70" />
        </button>

        {/* Video Player / Generating Placeholder */}
        <div className="relative bg-black rounded-t-2xl overflow-hidden">
          {video.videoUrl ? (
            <div
              className="relative w-full mx-auto"
              style={{ aspectRatio: "9/16", maxHeight: "50vh" }}
            >
              <video
                ref={videoRef}
                src={video.videoUrl}
                poster={video.thumbnailUrl || undefined}
                controls
                autoPlay
                muted
                playsInline
                className="w-full h-full object-contain bg-black"
              />
              {/* Unmute button */}
              <button
                onClick={toggleMute}
                className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-black/80 active:bg-black/90 transition-colors z-10"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-white/80" />
                ) : (
                  <Volume2 className="w-4 h-4 text-white/80" />
                )}
              </button>
            </div>
          ) : (
            <div
              className="relative w-full mx-auto flex flex-col items-center justify-center"
              style={{ aspectRatio: "9/16", maxHeight: "40vh" }}
            >
              {video.status === "generating" ? (
                <>
                  <Loader2 className="w-10 h-10 text-purple-400/60 animate-spin mb-4" />
                  <p className="text-sm text-white/30 font-medium">
                    Generating video...
                  </p>
                  <p className="text-xs text-white/15 mt-1">
                    This may take a few minutes
                  </p>
                </>
              ) : video.status === "failed" ? (
                <>
                  <AlertTriangle className="w-10 h-10 text-red-400/60 mb-4" />
                  <p className="text-sm text-red-400/70 font-medium">
                    Generation failed
                  </p>
                  <p className="text-xs text-white/15 mt-1">
                    {errorMessage || "Something went wrong. Try again."}
                  </p>
                </>
              ) : (
                <>
                  <Film className="w-10 h-10 text-white/[0.08] mb-4" />
                  <p className="text-sm text-white/25 font-medium">
                    No video yet
                  </p>
                  <p className="text-xs text-white/15 mt-1">
                    Video will appear here once generated
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="p-6 space-y-5">
          {/* Title + Status */}
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-white/90 leading-tight">
              {video.title}
            </h2>
            <span
              className={`text-xs px-2.5 py-1 rounded-full capitalize border flex-shrink-0 ${
                statusStyles[video.status] || statusStyles.draft
              }`}
            >
              {video.status}
            </span>
          </div>

          {/* Description */}
          {video.description && (
            <p className="text-sm text-white/40 leading-relaxed">
              {video.description}
            </p>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <Cpu className="w-3.5 h-3.5 text-white/25" />
              <span className="text-xs text-white/50">
                {modelLabels[video.model] || video.model}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <Clock className="w-3.5 h-3.5 text-white/25" />
              <span className="text-xs text-white/50">
                {formatDuration(video.duration)}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <Tag className="w-3.5 h-3.5 text-white/25" />
              <span className="text-xs text-white/50">
                {formatContentType(video.contentType)}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <Calendar className="w-3.5 h-3.5 text-white/25" />
              <span className="text-xs text-white/50">
                {new Date(video.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Created date full */}
          <p className="text-xs text-white/20">
            Created {formatDate(video.createdAt)}
          </p>

          {/* Script / Prompt */}
          {scriptText && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 text-white/25" />
                <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
                  Script / Prompt
                </span>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] max-h-64 overflow-y-auto">
                <pre className="text-xs text-white/35 leading-relaxed whitespace-pre-wrap font-sans">
                  {displayScript}
                  {scriptIsLong && !scriptExpanded && "..."}
                </pre>
                {scriptIsLong && (
                  <button
                    onClick={() => setScriptExpanded(!scriptExpanded)}
                    className="mt-2 text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
                  >
                    {scriptExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Approve / Reject buttons (only for review status) */}
          {video.status === "review" && (
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleStatusUpdate("approved")}
                disabled={updating}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-sm font-medium border border-emerald-500/20 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
              >
                {updating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Approve
              </button>
              <button
                onClick={() => handleStatusUpdate("draft")}
                disabled={updating}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50"
              >
                {updating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Reject
              </button>
            </div>
          )}

          {/* Retry button (only for failed status) */}
          {video.status === "failed" && (
            <div className="space-y-3 pt-2">
              {errorMessage && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400/80" />
                    <span className="text-xs font-medium text-red-400/80 uppercase tracking-wider">Error</span>
                  </div>
                  <p className="text-sm text-red-400/60">{errorMessage}</p>
                </div>
              )}
              {onRetry && (
                <button
                  onClick={() => onRetry(video.id)}
                  disabled={updating}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50"
                >
                  {updating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Retry Generation
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
