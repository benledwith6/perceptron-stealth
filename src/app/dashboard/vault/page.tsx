"use client";

import { useEffect, useState, useRef } from "react";
import {
  Camera,
  Mic,
  Palette,
  Upload,
  Loader2,
  Trash2,
  Star,
  Image as ImageIcon,
} from "lucide-react";

type Tab = "photos" | "voices" | "brand";

interface Photo { id: string; filename: string; url: string; isPrimary: boolean; createdAt: string; }
interface Voice { id: string; filename: string; url: string; duration: number; isDefault: boolean; createdAt: string; }
interface Brand { brandName?: string; tagline?: string; toneOfVoice?: string; targetAudience?: string; competitors?: string; brandColors?: string; guidelines?: string; }

export default function VaultPage() {
  const [tab, setTab] = useState<Tab>("photos");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [brand, setBrand] = useState<Brand>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadAll(controller.signal);
    return () => controller.abort();
  }, []);

  async function loadAll(signal?: AbortSignal) {
    setLoading(true);
    try {
      const [pRes, vRes, bRes] = await Promise.all([
        fetch("/api/photos", { signal }), fetch("/api/voices", { signal }), fetch("/api/brand-profile", { signal }),
      ]);
      if (pRes.ok) { const data = await pRes.json(); setPhotos(Array.isArray(data) ? data : []); }
      if (vRes.ok) { const data = await vRes.json(); setVoices(Array.isArray(data) ? data : []); }
      if (bRes.ok) { const d = await bRes.json(); if (d && !d.error) setBrand(d); }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Failed to load vault data:", err);
      }
    } finally { setLoading(false); }
  }

  async function saveBrand() {
    setSaving(true);
    try {
      const res = await fetch("/api/brand-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brand),
      });
      if (res.ok) showToast("Brand profile saved");
    } catch {} finally { setSaving(false); }
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

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: "photos", label: "Photos", icon: Camera, count: photos.length },
    { id: "voices", label: "Voice Samples", icon: Mic, count: voices.length },
    { id: "brand", label: "Brand Profile", icon: Palette },
  ];

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-5 h-5 text-white/20 animate-spin" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Vault</h1>
        <p className="text-sm text-white/40 mt-1">Your photos, voice samples, and brand profile</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-white/[0.04]">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-3 text-[14px] border-b-2 transition-all ${tab === t.id ? "border-white/60 text-white/90" : "border-transparent text-white/30 hover:text-white/50"}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count !== undefined && <span className="text-[11px] text-white/20 ml-1">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Photos */}
      {tab === "photos" && (
        <div>
          {photos.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] mb-5">
                <ImageIcon className="w-6 h-6 text-white/15" />
              </div>
              <h3 className="text-[17px] font-semibold text-white/80 mb-1">No photos uploaded</h3>
              <p className="text-[14px] text-white/30">Upload photos during onboarding or here to improve your AI avatar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map((photo) => (
                <div key={photo.id} className="relative group">
                  <div className="aspect-square rounded-xl overflow-hidden border border-white/[0.04] bg-white/[0.02]">
                    {photo.url && !photo.url.startsWith("/uploads/") ? (
                      <img src={photo.url} alt={photo.filename} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-white/[0.06]" />
                      </div>
                    )}
                  </div>
                  {photo.isPrimary && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur text-[10px] text-yellow-400">
                      <Star className="w-2.5 h-2.5" /> Primary
                    </div>
                  )}
                  <p className="text-[12px] text-white/25 mt-2 truncate">{photo.filename}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Voices */}
      {tab === "voices" && (
        <div>
          {voices.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] mb-5">
                <Mic className="w-6 h-6 text-white/15" />
              </div>
              <h3 className="text-[17px] font-semibold text-white/80 mb-1">No voice samples</h3>
              <p className="text-[14px] text-white/30">Record a voice sample to give your AI avatar your voice.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {voices.map((voice) => (
                <div key={voice.id} className="flex items-center gap-4 px-5 py-4 rounded-xl border border-white/[0.04] bg-white/[0.015]">
                  <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center">
                    <Mic className="w-4 h-4 text-white/30" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-white/80 truncate">{voice.filename}</div>
                    <div className="text-[12px] text-white/25">{voice.duration}s</div>
                  </div>
                  {voice.isDefault && (
                    <span className="text-[11px] text-blue-400/70 px-2 py-0.5 rounded-full bg-blue-500/10">Default</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Brand Profile */}
      {tab === "brand" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] text-white/30 mb-1.5">Brand Name</label>
              <input type="text" value={brand.brandName || ""} onChange={(e) => setBrand({ ...brand, brandName: e.target.value })} placeholder="Your business name" className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-[12px] text-white/30 mb-1.5">Tagline</label>
              <input type="text" value={brand.tagline || ""} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} placeholder="Your tagline or slogan" className="input-field text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] text-white/30 mb-1.5">Tone of Voice</label>
              <select value={brand.toneOfVoice || ""} onChange={(e) => setBrand({ ...brand, toneOfVoice: e.target.value })} className="input-field text-sm">
                <option value="">Select tone</option>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="friendly">Friendly</option>
                <option value="authoritative">Authoritative</option>
                <option value="playful">Playful</option>
                <option value="inspirational">Inspirational</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-white/30 mb-1.5">Target Audience</label>
              <input type="text" value={brand.targetAudience || ""} onChange={(e) => setBrand({ ...brand, targetAudience: e.target.value })} placeholder="Who are you trying to reach?" className="input-field text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] text-white/30 mb-1.5">Brand Guidelines</label>
            <textarea value={brand.guidelines || ""} onChange={(e) => setBrand({ ...brand, guidelines: e.target.value })} placeholder="Any specific guidelines for AI-generated content..." className="input-field text-sm min-h-[100px] resize-y" />
          </div>
          <button onClick={saveBrand} disabled={saving} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#050508] text-[14px] font-medium hover:bg-white/90 disabled:opacity-40 transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save Brand Profile
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-white/10 backdrop-blur-xl border border-white/10 text-white text-sm px-4 py-2.5 rounded-xl z-50">{toast}</div>
      )}
    </div>
  );
}
