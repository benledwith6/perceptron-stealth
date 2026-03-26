"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Video,
  Eye,
  ArrowRight,
  Play,
  Calendar,
  Wand2,
  CheckCircle2,
  Loader2,
  Film,
} from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
  model: string;
  status: string;
  createdAt: string;
  schedule?: { platform: string; scheduledAt: string } | null;
}

const statusStyles: Record<string, string> = {
  published: "bg-green-500/10 text-green-400",
  review: "bg-yellow-500/10 text-yellow-400",
  scheduled: "bg-blue-500/10 text-blue-400",
  approved: "bg-emerald-500/10 text-emerald-400",
  draft: "bg-white/[0.06] text-white/40",
  generating: "bg-purple-500/10 text-purple-400",
};

const modelLabels: Record<string, string> = {
  kling_2_6: "Kling 2.6",
  "kling_2.6": "Kling 2.6",
  seedance_2_0: "Seedance 2.0",
  "seedance_2.0": "Seedance 2.0",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatScheduleDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function OverviewPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/videos", { signal: controller.signal }).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/schedule", { signal: controller.signal }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([v, s]) => {
      setVideos(Array.isArray(v) ? v : []);
      setSchedules(Array.isArray(s) ? s : []);
      setLoading(false);
    }).catch((err) => {
      if (err.name !== "AbortError") {
        setError("Failed to load dashboard data. Please try again.");
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  const totalVideos = videos.length;
  const publishedCount = videos.filter((v) => v.status === "published").length;
  const reviewCount = videos.filter((v) => v.status === "review").length;
  const upcomingSchedules = schedules.filter((s: any) => s.status === "scheduled" && new Date(s.scheduledAt) > new Date());
  const recentVideos = videos.slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto text-center py-24">
        <p className="text-[14px] text-red-400/70 mb-4">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
          className="px-4 py-2 rounded-xl bg-white/[0.06] text-sm text-white/60 hover:bg-white/[0.1] transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state for brand new users
  if (totalVideos === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="text-center py-24">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.03] mb-6">
            <Film className="w-7 h-7 text-white/15" />
          </div>
          <h1 className="text-[24px] font-semibold text-white/90 mb-2">Welcome to Official AI</h1>
          <p className="text-[15px] text-white/35 max-w-md mx-auto mb-8">
            Create your first AI video and watch your content library grow.
          </p>
          <Link href="/dashboard/generate" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 transition-all">
            <Wand2 className="w-4 h-4" /> Create Your First Video
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-white/40 mt-1">Your content at a glance</p>
        </div>
        <Link href="/dashboard/generate" className="btn-primary gap-2">
          <Wand2 className="w-4 h-4" /> Create Video
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-5">
          <div className="text-2xl font-bold text-white">{totalVideos}</div>
          <div className="text-sm text-white/35 mt-0.5">Total Videos</div>
        </div>
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-5">
          <div className="text-2xl font-bold text-white">{publishedCount}</div>
          <div className="text-sm text-white/35 mt-0.5">Published</div>
        </div>
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-5">
          <div className="text-2xl font-bold text-white">{reviewCount}</div>
          <div className="text-sm text-white/35 mt-0.5">Pending Review</div>
        </div>
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-5">
          <div className="text-2xl font-bold text-white">{upcomingSchedules.length}</div>
          <div className="text-sm text-white/35 mt-0.5">Scheduled</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Content */}
        <div className="lg:col-span-2 rounded-xl border border-white/[0.04] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
            <h2 className="text-[15px] font-semibold text-white/90">Recent Content</h2>
            <Link href="/dashboard/content" className="text-sm text-white/30 hover:text-white/50 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentVideos.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-white/25">No videos yet</div>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {recentVideos.map((item) => (
                <div key={item.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.015] transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0">
                    <Play className="w-4 h-4 text-white/15" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-white/85">{item.title}</div>
                    <div className="text-xs text-white/25 mt-0.5">
                      {modelLabels[item.model] || item.model}
                    </div>
                  </div>
                  <div className="hidden sm:block text-xs text-white/25">{formatDate(item.createdAt)}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${statusStyles[item.status] || statusStyles.draft}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Schedule */}
        <div className="rounded-xl border border-white/[0.04] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
            <h2 className="text-[15px] font-semibold text-white/90">Upcoming</h2>
            <Link href="/dashboard/calendar" className="text-sm text-white/30 hover:text-white/50 flex items-center gap-1 transition-colors">
              Calendar <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {upcomingSchedules.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-white/25">Nothing scheduled</div>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {upcomingSchedules.slice(0, 4).map((item: any) => (
                <div key={item.id} className="px-5 py-4">
                  <div className="text-sm font-medium text-white/85">{item.video?.title || "Untitled"}</div>
                  <div className="text-xs text-white/25 mt-1">
                    {item.platform} · {formatScheduleDate(item.scheduledAt)} · {formatTime(item.scheduledAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending Approvals Banner */}
      {reviewCount > 0 && (
        <div className="rounded-xl border border-yellow-500/10 bg-yellow-500/[0.03] p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <CheckCircle2 className="w-5 h-5 text-yellow-400/70 flex-shrink-0" />
              <div>
                <div className="text-[14px] sm:text-[15px] font-medium text-white/85">{reviewCount} video{reviewCount !== 1 ? "s" : ""} awaiting review</div>
                <div className="text-xs sm:text-sm text-white/30">Review and approve before publishing</div>
              </div>
            </div>
            <Link href="/dashboard/approvals" className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white/[0.06] text-sm text-white/60 hover:bg-white/[0.1] hover:text-white/80 active:bg-white/[0.15] transition-all flex-shrink-0">
              Review <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
