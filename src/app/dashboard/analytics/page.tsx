"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  Heart,
  Share2,
  MessageCircle,
  Loader2,
  BarChart3,
  Video,
} from "lucide-react";

interface Summary {
  totalVideos: number;
  publishedVideos: number;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/analytics/summary", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSummary(d); })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch analytics:", err);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-white/20 animate-spin" /></div>;
  }

  const stats = [
    { label: "Total Views", value: summary?.totalViews || 0, icon: Eye },
    { label: "Likes", value: summary?.totalLikes || 0, icon: Heart },
    { label: "Shares", value: summary?.totalShares || 0, icon: Share2 },
    { label: "Comments", value: summary?.totalComments || 0, icon: MessageCircle },
  ];

  const hasData = summary && (summary.totalViews > 0 || summary.totalLikes > 0 || summary.totalVideos > 0);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-white/40 mt-1">
          {summary ? `${summary.totalVideos} video${summary.totalVideos !== 1 ? "s" : ""} · ${summary.publishedVideos} published` : "\u00A0"}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-5">
            <div className="flex items-center justify-between mb-3">
              <stat.icon className="w-4 h-4 text-white/20" />
            </div>
            <div className="text-[24px] font-bold text-white">{formatNumber(stat.value)}</div>
            <div className="text-[13px] text-white/30 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {!hasData && (
        <div className="text-center py-16 rounded-xl border border-white/[0.04] bg-white/[0.015]">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] mb-5">
            <BarChart3 className="w-6 h-6 text-white/15" />
          </div>
          <h3 className="text-[17px] font-semibold text-white/80 mb-1">No analytics yet</h3>
          <p className="text-[14px] text-white/30 max-w-sm mx-auto">
            Publish videos and connect your social accounts to start seeing performance data here.
          </p>
        </div>
      )}

      {/* Video count summary */}
      {hasData && (
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-6">
          <h2 className="text-[15px] font-semibold text-white/80 mb-4">Content Summary</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                <Video className="w-5 h-5 text-white/25" />
              </div>
              <div>
                <div className="text-[20px] font-bold text-white">{summary?.totalVideos || 0}</div>
                <div className="text-[13px] text-white/30">Total Videos</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/[0.08] flex items-center justify-center">
                <Video className="w-5 h-5 text-green-400/50" />
              </div>
              <div>
                <div className="text-[20px] font-bold text-white">{summary?.publishedVideos || 0}</div>
                <div className="text-[13px] text-white/30">Published</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
