"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  MessageSquare,
  Loader2,
  Cpu,
} from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
  model: string;
  contentType: string;
  script: string | null;
  videoUrl: string | null;
  duration: number;
  createdAt: string;
}

const modelLabels: Record<string, string> = {
  "kling_2.6": "Kling 2.6",
  "seedance_2.0": "Seedance 2.0",
};

export default function ApprovalsPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPending(controller.signal);
    return () => controller.abort();
  }, []);

  async function fetchPending(signal?: AbortSignal) {
    setLoading(true);
    try {
      const res = await fetch("/api/videos?status=review", { signal });
      if (res.ok) {
        const data = await res.json();
        setVideos(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Failed to fetch pending videos:", err);
      }
    } finally { setLoading(false); }
  }

  async function updateStatus(status: "approved" | "rejected" | "draft") {
    const video = videos[currentIndex];
    if (!video) return;
    setActing(true);
    try {
      await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const updated = videos.filter((_, i) => i !== currentIndex);
      setVideos(updated);
      setCurrentIndex(Math.min(currentIndex, Math.max(0, updated.length - 1)));
      setFeedback("");
    } catch {} finally { setActing(false); }
  }

  const video = videos[currentIndex];

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-white/20 animate-spin" /></div>;
  }

  if (videos.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] mb-5">
          <Check className="w-6 h-6 text-white/15" />
        </div>
        <h1 className="text-[20px] font-semibold text-white/80 mb-1">All caught up</h1>
        <p className="text-[14px] text-white/30">No videos pending review right now.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Approvals</h1>
          <p className="text-sm text-white/40 mt-1">{videos.length} pending</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0} className="p-2 rounded-lg border border-white/[0.06] text-white/30 hover:text-white/60 disabled:opacity-20 transition-all"><ArrowLeft className="w-4 h-4" /></button>
          <span className="text-sm text-white/30 px-2">{currentIndex + 1} / {videos.length}</span>
          <button onClick={() => setCurrentIndex(Math.min(videos.length - 1, currentIndex + 1))} disabled={currentIndex >= videos.length - 1} className="p-2 rounded-lg border border-white/[0.06] text-white/30 hover:text-white/60 disabled:opacity-20 transition-all"><ArrowRight className="w-4 h-4" /></button>
        </div>
      </div>

      {video && (
        <div className="space-y-6">
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-6">
            <h2 className="text-[18px] font-semibold text-white/90 mb-4">{video.title}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-[11px] text-white/25 uppercase tracking-wider mb-1">Model</div>
                <div className="flex items-center gap-1.5 text-sm text-white/70"><Cpu className="w-3.5 h-3.5 text-white/30" />{modelLabels[video.model] || video.model}</div>
              </div>
              <div>
                <div className="text-[11px] text-white/25 uppercase tracking-wider mb-1">Type</div>
                <div className="text-sm text-white/70 capitalize">{video.contentType.replace(/_/g, " ")}</div>
              </div>
              <div>
                <div className="text-[11px] text-white/25 uppercase tracking-wider mb-1">Duration</div>
                <div className="text-sm text-white/70">{video.duration || 8}s</div>
              </div>
              <div>
                <div className="text-[11px] text-white/25 uppercase tracking-wider mb-1">Created</div>
                <div className="text-sm text-white/70">{new Date(video.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
              </div>
            </div>
          </div>

          {video.videoUrl && (
            <div className="rounded-xl border border-white/[0.04] bg-black overflow-hidden">
              <video
                src={video.videoUrl}
                controls
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {video.script && (
            <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-6">
              <div className="text-[11px] text-white/25 uppercase tracking-wider mb-3">Script</div>
              <p className="text-[14px] text-white/60 leading-relaxed whitespace-pre-wrap">{video.script}</p>
            </div>
          )}

          <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-6">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-3.5 h-3.5 text-white/25" />
              <div className="text-[11px] text-white/25 uppercase tracking-wider">Feedback (optional)</div>
            </div>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Add notes for revision..." className="w-full bg-transparent border-0 text-sm text-white/70 placeholder:text-white/15 resize-none focus:outline-none min-h-[60px]" />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => updateStatus("rejected")} disabled={acting} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-red-500/15 text-red-400/80 text-[14px] hover:bg-red-500/[0.06] disabled:opacity-40 transition-all"><X className="w-4 h-4" /> Reject</button>
            <button onClick={() => updateStatus("draft")} disabled={acting} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/[0.06] text-white/50 text-[14px] hover:bg-white/[0.03] disabled:opacity-40 transition-all">Request Changes</button>
            <div className="flex-1" />
            <button onClick={() => updateStatus("approved")} disabled={acting} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 disabled:opacity-40 transition-all">
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
