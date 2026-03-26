"use client";

import { useEffect, useState, useRef } from "react";
import { Save, RefreshCw, Settings2, MessageSquare, Sparkles } from "lucide-react";

interface ConfigRow {
  id: string;
  key: string;
  value: string;
  label: string;
  category: string;
  updatedAt: string;
}

const MODEL_OPTIONS = [
  { value: "kling_2.6", label: "Kling 2.6" },
  { value: "seedance_2.0", label: "Seedance 2.0" },
  { value: "sora_2", label: "Sora 2" },
  { value: "ltx", label: "LTX" },
  { value: "nano_banana", label: "Nano Banana (Gemini)" },
  { value: "kling_2.6_fal", label: "Kling 2.6 (via FAL)" },
];

const TABS = [
  { id: "models", label: "Models", icon: Sparkles },
  { id: "prompts", label: "Prompts", icon: MessageSquare },
  { id: "onboarding", label: "Onboarding", icon: Settings2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("models");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadConfigs(controller.signal);
    return () => controller.abort();
  }, []);

  async function loadConfigs(signal?: AbortSignal) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/config", { signal });
      if (res.ok) {
        const data = await res.json();
        setConfigs(Array.isArray(data) ? data : []);
        // Initialize edited values
        const values: Record<string, string> = {};
        (Array.isArray(data) ? data : []).forEach((c: ConfigRow) => {
          values[c.key] = c.value;
        });
        setEditedValues(values);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Failed to load configs:", err);
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(key: string) {
    setSaving(key);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: editedValues[key] }),
      });
      if (res.ok) {
        showToast(`Saved "${key}"`);
        // Update local state with new timestamp
        setConfigs((prev) =>
          prev.map((c) =>
            c.key === key ? { ...c, value: editedValues[key], updatedAt: new Date().toISOString() } : c
          )
        );
      } else {
        showToast("Failed to save");
      }
    } catch {
      showToast("Failed to save");
    } finally {
      setSaving(null);
    }
  }

  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }
  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  function isChanged(key: string) {
    const original = configs.find((c) => c.key === key);
    return original && editedValues[key] !== original.value;
  }

  const filtered = configs.filter((c) => c.category === activeTab);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">System Configuration</h1>
        <p className="text-white/40 text-sm mt-1">
          Manage AI models, prompts, and onboarding settings
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      )}

      {/* Config List */}
      {!loading && (
        <div className="space-y-4">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-white/30">
              No configuration found for this category.
            </div>
          )}

          {filtered.map((config) => (
            <div
              key={config.key}
              className="bg-[#0f1420] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">{config.label}</h3>
                  <p className="text-xs text-white/30 font-mono mt-0.5">{config.key}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isChanged(config.key) && (
                    <span className="text-xs text-amber-400/80">unsaved</span>
                  )}
                  <button
                    onClick={() => saveConfig(config.key)}
                    disabled={!isChanged(config.key) || saving === config.key}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isChanged(config.key)
                        ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30"
                        : "bg-white/5 text-white/20 cursor-not-allowed"
                    }`}
                  >
                    {saving === config.key ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    Save
                  </button>
                </div>
              </div>

              {/* Model selector for model configs */}
              {config.category === "models" && (
                <select
                  value={editedValues[config.key] || config.value}
                  onChange={(e) =>
                    setEditedValues((prev) => ({ ...prev, [config.key]: e.target.value }))
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[#0f1420]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {/* Textarea for prompt configs */}
              {config.category === "prompts" && (
                <textarea
                  value={editedValues[config.key] || config.value}
                  onChange={(e) =>
                    setEditedValues((prev) => ({ ...prev, [config.key]: e.target.value }))
                  }
                  rows={5}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/80 focus:outline-none focus:border-blue-500/50 resize-y font-mono leading-relaxed"
                />
              )}

              {/* JSON editor for onboarding configs */}
              {config.category === "onboarding" && (
                <textarea
                  value={editedValues[config.key] || config.value}
                  onChange={(e) =>
                    setEditedValues((prev) => ({ ...prev, [config.key]: e.target.value }))
                  }
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/80 focus:outline-none focus:border-blue-500/50 resize-y font-mono"
                />
              )}

              {/* Timestamp */}
              <p className="text-[10px] text-white/20 mt-2">
                Last updated: {new Date(config.updatedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white/10 backdrop-blur-xl border border-white/10 text-white text-sm px-4 py-2.5 rounded-xl shadow-2xl animate-fade-in z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
