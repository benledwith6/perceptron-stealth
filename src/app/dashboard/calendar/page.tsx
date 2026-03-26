"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
} from "lucide-react";

interface ScheduleItem {
  id: string;
  platform: string;
  scheduledAt: string;
  publishedAt: string | null;
  status: string;
  video: { id: string; title: string; model: string };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const platformColors: Record<string, string> = {
  instagram: "bg-pink-500/15 text-pink-400",
  linkedin: "bg-blue-500/15 text-blue-400",
  tiktok: "bg-white/10 text-white/70",
  youtube: "bg-red-500/15 text-red-400",
  facebook: "bg-blue-600/15 text-blue-300",
  twitter: "bg-sky-500/15 text-sky-400",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function CalendarPage() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const controller = new AbortController();
    fetchSchedules(controller.signal);
    return () => controller.abort();
  }, []);

  async function fetchSchedules(signal?: AbortSignal) {
    setLoading(true);
    try {
      const res = await fetch("/api/schedule", { signal });
      if (res.ok) {
        const data = await res.json();
        setSchedules(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Failed to fetch schedules:", err);
      }
    } finally { setLoading(false); }
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }

  function getSchedulesForDay(day: number): ScheduleItem[] {
    return schedules.filter((s) => {
      const d = new Date(s.scheduledAt);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-white/20 animate-spin" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-white/40 mt-1">{schedules.length} scheduled post{schedules.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 rounded-lg border border-white/[0.06] text-white/30 hover:text-white/60 transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[15px] font-medium text-white/80 min-w-[160px] text-center">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg border border-white/[0.06] text-white/30 hover:text-white/60 transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-white/[0.04] overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-white/[0.04]">
          {DAYS.map((day) => (
            <div key={day} className="px-3 py-2.5 text-[11px] text-white/25 uppercase tracking-wider text-center">
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-white/[0.02] bg-white/[0.005]" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const daySchedules = getSchedulesForDay(day);
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

            return (
              <div key={day} className={`min-h-[100px] border-b border-r border-white/[0.02] p-2 ${isToday ? "bg-blue-500/[0.03]" : ""}`}>
                <div className={`text-[13px] mb-1.5 ${isToday ? "text-blue-400 font-semibold" : "text-white/30"}`}>
                  {day}
                </div>
                <div className="space-y-1">
                  {daySchedules.map((s) => (
                    <div key={s.id} className={`px-1.5 py-1 rounded text-[10px] truncate ${platformColors[s.platform] || "bg-white/[0.06] text-white/50"}`}>
                      {s.video.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming list */}
      {schedules.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[15px] font-semibold text-white/80 mb-4">Upcoming Posts</h2>
          <div className="space-y-2">
            {schedules
              .filter((s) => s.status === "scheduled" && new Date(s.scheduledAt) > new Date())
              .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
              .slice(0, 8)
              .map((s) => (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3 rounded-xl border border-white/[0.04] bg-white/[0.015]">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-white/80 truncate">{s.video.title}</div>
                    <div className="text-[12px] text-white/25 mt-0.5">
                      {new Date(s.scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {formatTime(s.scheduledAt)}
                    </div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${platformColors[s.platform] || "bg-white/[0.06] text-white/50"}`}>
                    {s.platform}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {schedules.length === 0 && (
        <div className="text-center py-8 mt-4">
          <CalendarDays className="w-6 h-6 text-white/10 mx-auto mb-3" />
          <p className="text-[14px] text-white/25">No posts scheduled yet.</p>
        </div>
      )}
    </div>
  );
}
