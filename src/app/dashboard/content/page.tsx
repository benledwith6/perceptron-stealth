"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Play,
  Search,
  MoreVertical,
  Eye,
  Cpu,
  Grid3X3,
  List,
  Video,
  Loader2,
  Film,
} from "lucide-react";
import VideoDetailModal from "@/components/VideoDetailModal";

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

const statusStyles: Record<string, string> = {
  published: "bg-green-500/10 text-green-400",
  review: "bg-yellow-500/10 text-yellow-400",
  scheduled: "bg-blue-500/10 text-blue-400",
  approved: "bg-emerald-500/10 text-emerald-400",
  draft: "bg-white/[0.06] text-white/40",
  generating: "bg-purple-500/10 text-purple-400",
  failed: "bg-red-500/10 text-red-400",
};

const modelLabels: Record<string, string> = {
  "kling_2.6": "Kling 2.6",
  "seedance_2.0": "Seedance 2.0",
  sora_2: "Sora 2",
};

const filters = ["All", "Published", "Review", "Scheduled", "Approved", "Draft", "Failed"];

function formatDuration(seconds: number): string {
  if (!seconds) return "0:08";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ContentPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [videoError, setVideoError] = useState<string | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    fetchVideos(controller.signal);
    return () => controller.abort();
  }, []);

  async function fetchVideos(signal?: AbortSignal) {
    setLoading(true);
    try {
      const res = await fetch("/api/videos", { signal });
      if (res.ok) {
        const data = await res.json();
        setVideos(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Failed to fetch videos:", err);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectVideo(video: VideoItem) {
    setSelectedVideo(video);
    setVideoError(undefined);

    // Fetch error message for failed videos from the status endpoint
    if (video.status === "failed") {
      try {
        const res = await fetch(`/api/generate/status?videoId=${video.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.error) setVideoError(data.error);
        }
      } catch {
        // Ignore — error display is best-effort
      }
    }
  }

  async function handleRetry(videoId: string) {
    try {
      const retryRes = await fetch("/api/generate/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      if (!retryRes.ok) {
        const errData = await retryRes.json().catch(() => ({}));
        console.error("Retry failed:", errData.error);
        return;
      }

      // Re-trigger the generation pipeline
      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      // Update local state to reflect the retry
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, status: "generating", videoUrl: null, thumbnailUrl: null } : v
        )
      );
      setSelectedVideo(null);
    } catch (err) {
      console.error("Retry error:", err);
    }
  }

  const filtered = videos.filter((v) => {
    if (activeFilter !== "All" && v.status !== activeFilter.toLowerCase()) return false;
    if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Library</h1>
          <p className="text-sm text-white/40 mt-1">
            {loading ? "\u00A0" : `${videos.length} video${videos.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link href="/dashboard/generate" className="btn-primary gap-2 text-sm">
          <Video className="w-4 h-4" /> Create New
        </Link>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10 !py-2"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeFilter === f
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                  : "text-white/40 hover:text-white/60 border border-transparent"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-lg transition-colors ${viewMode === "grid" ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50"}`}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-lg transition-colors ${viewMode === "list" ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] mb-5">
            <Film className="w-6 h-6 text-white/15" />
          </div>
          <h3 className="text-[17px] font-semibold text-white/80 mb-1">No videos yet</h3>
          <p className="text-[14px] text-white/30 mb-6">Create your first AI video to get started.</p>
          <Link href="/dashboard/generate" className="btn-primary gap-2 text-sm">
            <Video className="w-4 h-4" /> Create Video
          </Link>
        </div>
      )}

      {/* No results for filter */}
      {!loading && videos.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[14px] text-white/30">No videos match this filter.</p>
        </div>
      )}

      {/* Grid View */}
      {!loading && filtered.length > 0 && viewMode === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((video) => (
            <VideoGridCard
              key={video.id}
              video={video}
              onSelect={() => handleSelectVideo(video)}
            />
          ))}
        </div>
      )}

      {/* List View */}
      {!loading && filtered.length > 0 && viewMode === "list" && (
        <div className="rounded-xl border border-white/[0.04] overflow-hidden divide-y divide-white/[0.03]">
          {filtered.map((video) => (
            <div
              key={video.id}
              onClick={() => handleSelectVideo(video)}
              className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.015] transition-colors cursor-pointer"
            >
              <div className="w-16 h-10 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0 overflow-hidden">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Play className="w-3 h-3 text-white/15" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-white/90">{video.title}</div>
                <div className="text-xs text-white/25">{modelLabels[video.model] || video.model} · {formatDuration(video.duration)}</div>
              </div>
              <div className="hidden sm:block text-xs text-white/25">{formatDate(video.createdAt)}</div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${statusStyles[video.status] || statusStyles.draft}`}>
                {video.status}
              </span>
              <button className="p-1 rounded hover:bg-white/5 text-white/20">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Video Detail Modal */}
      {selectedVideo && (
        <VideoDetailModal
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onStatusChange={(id, newStatus) => {
            setVideos((prev) =>
              prev.map((v) => (v.id === id ? { ...v, status: newStatus } : v))
            );
            setSelectedVideo(null);
          }}
          onRetry={handleRetry}
          errorMessage={videoError}
        />
      )}
    </div>
  );
}

/** Grid card with inline hover video preview */
function VideoGridCard({
  video,
  onSelect,
}: {
  video: VideoItem;
  onSelect: () => void;
}) {
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [hovering, setHovering] = useState(false);

  // Pause preview video on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (videoPreviewRef.current) {
        videoPreviewRef.current.pause();
        videoPreviewRef.current.removeAttribute("src");
        videoPreviewRef.current.load();
      }
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    setHovering(true);
    if (video.videoUrl && videoPreviewRef.current) {
      videoPreviewRef.current.play().catch(() => {});
    }
  }, [video.videoUrl]);

  const handleMouseLeave = useCallback(() => {
    setHovering(false);
    if (videoPreviewRef.current) {
      videoPreviewRef.current.pause();
      videoPreviewRef.current.currentTime = 0;
    }
  }, []);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="rounded-xl border border-white/[0.04] bg-white/[0.015] overflow-hidden group hover:border-white/[0.08] transition-all cursor-pointer"
    >
      <div className="aspect-video bg-white/[0.02] relative flex items-center justify-center overflow-hidden">
        {/* Hover video preview */}
        {video.videoUrl && (
          <video
            ref={videoPreviewRef}
            src={video.videoUrl}
            muted
            loop
            playsInline
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              hovering ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Thumbnail / fallback */}
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt=""
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              hovering && video.videoUrl ? "opacity-0" : "opacity-100"
            }`}
          />
        ) : (
          <Film className="w-8 h-8 text-white/[0.06]" />
        )}

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="w-5 h-5 text-white ml-0.5" />
          </div>
        </div>
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-black/50 backdrop-blur rounded-full">
          <Cpu className="w-2.5 h-2.5 text-white/60" />
          <span className="text-[10px] font-medium text-white/70">
            {modelLabels[video.model] || video.model}
          </span>
        </div>
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/50 backdrop-blur rounded text-[10px] text-white/70">
          {formatDuration(video.duration)}
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-medium truncate text-white/90">
          {video.title}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-white/25">
            {formatDate(video.createdAt)}
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${
              statusStyles[video.status] || statusStyles.draft
            }`}
          >
            {video.status}
          </span>
        </div>
      </div>
    </div>
  );
}
