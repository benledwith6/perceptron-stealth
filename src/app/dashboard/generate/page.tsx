"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Sparkles,
  Cpu,
  Zap,
  Check,
  RefreshCw,
  ChevronDown,
  Video,
  Star,
  FileText,
  MessageSquare,
  Home,
  MapPin,
  TrendingUp,
  X,
  Loader2,
  Film,
} from "lucide-react";
import { useGenerationProgress } from "@/hooks/use-generation-progress";
import { GenerationProgressBar } from "@/components/GenerationProgress";

const industryTemplates: Record<string, { id: string; label: string; icon: any; prompt: string; model: "kling_2.6" | "seedance_2.0" }[]> = {
  real_estate: [
    { id: "listing_tour", label: "Listing Video Tour", icon: Home, prompt: "Create a property walkthrough video for my new listing at [address]. Highlight key features like...", model: "kling_2.6" },
    { id: "market_update", label: "Weekly Market Update", icon: TrendingUp, prompt: "Create a market update video for [area] covering this week's inventory, pricing trends, and buyer activity.", model: "seedance_2.0" },
    { id: "just_sold", label: "Just Sold Celebration", icon: Star, prompt: "Create a 'Just Sold' announcement video for [address]. Congratulate the buyers and highlight the journey.", model: "seedance_2.0" },
    { id: "open_house", label: "Open House Invite", icon: MapPin, prompt: "Create an open house invitation video for [address] this [day] from [time]. Make it warm and inviting.", model: "seedance_2.0" },
    { id: "neighborhood", label: "Neighborhood Spotlight", icon: MapPin, prompt: "Create a neighborhood spotlight video for [area] covering restaurants, schools, parks, and community vibe.", model: "kling_2.6" },
    { id: "buyer_tips", label: "Buyer / Seller Tips", icon: MessageSquare, prompt: "Create an educational video with tips for [first-time buyers / sellers] in today's market.", model: "kling_2.6" },
  ],
  legal: [
    { id: "know_rights", label: "Know Your Rights", icon: FileText, prompt: "Create a 'Know Your Rights' video about [topic, e.g., tenant rights, wrongful termination].", model: "kling_2.6" },
    { id: "legal_tip", label: "Legal Tip of the Week", icon: MessageSquare, prompt: "Create a weekly legal tip video about [topic]. Keep it accessible for a general audience.", model: "seedance_2.0" },
    { id: "case_result", label: "Case Result Highlight", icon: Star, prompt: "Create a video highlighting a recent case result (anonymized): [brief case summary and outcome].", model: "seedance_2.0" },
    { id: "explainer", label: "Legal Process Explainer", icon: FileText, prompt: "Create an explainer video about the [legal process, e.g., personal injury claim, divorce filing] process.", model: "kling_2.6" },
  ],
  medical: [
    { id: "health_tip", label: "Health Tip", icon: MessageSquare, prompt: "Create a health tip video about [topic, e.g., sleep hygiene, heart health]. Keep it patient-friendly.", model: "seedance_2.0" },
    { id: "procedure", label: "Procedure Explainer", icon: FileText, prompt: "Create a reassuring explainer video about what patients can expect during [procedure name].", model: "kling_2.6" },
    { id: "wellness", label: "Wellness Series", icon: Star, prompt: "Create a wellness video about [topic]. Encourage healthy habits and preventive care.", model: "seedance_2.0" },
    { id: "myth_busting", label: "Medical Myth Busting", icon: MessageSquare, prompt: "Create a myth-busting video about [common misconception].", model: "kling_2.6" },
  ],
  creator: [
    { id: "brand_intro", label: "Brand Introduction", icon: Video, prompt: "Create a personal brand introduction video. I'm [name], I help [audience] with [value proposition].", model: "kling_2.6" },
    { id: "tip_video", label: "Quick Tip Video", icon: MessageSquare, prompt: "Create a quick tip video about [topic in your expertise area].", model: "seedance_2.0" },
    { id: "thought_leadership", label: "Thought Leadership", icon: TrendingUp, prompt: "Create a thought leadership video sharing my perspective on [trending topic in your industry].", model: "kling_2.6" },
    { id: "intro", label: "Social Media Intro", icon: Video, prompt: "Create a social-optimized intro video for [platform]. Hook viewers in the first 2 seconds.", model: "seedance_2.0" },
  ],
  business: [
    { id: "brand_intro", label: "Company Introduction", icon: Video, prompt: "Create a company introduction video. We're [company], we help [audience] with [value proposition].", model: "kling_2.6" },
    { id: "tip_video", label: "Industry Insight", icon: MessageSquare, prompt: "Create an educational video about [topic in your field].", model: "seedance_2.0" },
    { id: "testimonial", label: "Client Testimonial", icon: Star, prompt: "Transform this client review into a video testimonial: ", model: "seedance_2.0" },
    { id: "thought_leadership", label: "Thought Leadership", icon: TrendingUp, prompt: "Share your perspective on [trending topic in your industry].", model: "kling_2.6" },
  ],
  other: [
    { id: "brand_intro", label: "Introduction", icon: Video, prompt: "Create a personal introduction video. I'm [name], [title].", model: "kling_2.6" },
    { id: "tip_video", label: "Educational Tip", icon: MessageSquare, prompt: "Create an educational tip video about [topic].", model: "seedance_2.0" },
    { id: "testimonial", label: "Testimonial", icon: Star, prompt: "Transform this review into a video testimonial: ", model: "seedance_2.0" },
    { id: "thought_leadership", label: "Thought Leadership", icon: TrendingUp, prompt: "Share your perspective on [trending topic].", model: "kling_2.6" },
  ],
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  videoData?: {
    videoId: string;
    title: string;
    model: string;
    status: string;
    videoUrl: string | null;
    error?: string;
  };
  templateSuggestions?: typeof industryTemplates.real_estate;
  showProgress?: boolean;
}

const modelLabels: Record<string, string> = {
  "kling_2.6": "Kling 2.6",
  "seedance_2.0": "Seedance 2.0",
};

export default function GeneratePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<"kling_2.6" | "seedance_2.0">("kling_2.6");
  const [selectedFormat, setSelectedFormat] = useState("talking_head_15");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [industry] = useState("other");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // Track the currently-generating video for progress polling
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const activeStatusMsgIdRef = useRef<string | null>(null);

  const { progress, stepLabel } = useGenerationProgress({
    videoId: activeVideoId,
    enabled: isGenerating && !!activeVideoId,
    interval: 3000,
    onComplete: useCallback((video: { videoUrl: string | null }) => {
      const msgId = activeStatusMsgIdRef.current;
      if (msgId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  content: "Your video is ready! Review it below.",
                  showProgress: false,
                  videoData: m.videoData
                    ? { ...m.videoData, status: "review", videoUrl: video.videoUrl }
                    : undefined,
                }
              : m
          )
        );
      }
      setIsGenerating(false);
      setActiveVideoId(null);
    }, []),
    onError: useCallback((errorMsg: string) => {
      const msgId = activeStatusMsgIdRef.current;
      if (msgId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  content: `Generation failed: ${errorMsg}. Saved as a draft -- retry from the content library.`,
                  showProgress: false,
                  videoData: m.videoData
                    ? { ...m.videoData, status: "failed", error: errorMsg }
                    : undefined,
                }
              : m
          )
        );
      }
      setIsGenerating(false);
      setActiveVideoId(null);
    }, []),
  });

  // Close model picker on outside click
  useEffect(() => {
    if (!showModelPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModelPicker]);

  // Load user industry on mount
  useEffect(() => {
    const templates = industryTemplates[industry] || industryTemplates.other;
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "What would you like to create today? Pick a template or describe your video.",
      timestamp: new Date(),
      templateSuggestions: templates,
    }]);
  }, [industry]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (msg: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMsg = { ...msg, id: `msg-${Date.now()}-${Math.random()}`, timestamp: new Date() };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  };

  const updateMessage = (id: string, updates: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));
  };

  const handleTemplateSelect = (template: typeof industryTemplates.real_estate[0]) => {
    setSelectedModel(template.model);
    setInput(template.prompt);
    inputRef.current?.focus();
  };

  // ─── Real video generation flow ────────────────────────────────

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;
    const userMsg = input.trim();
    setInput("");

    addMessage({ role: "user", content: userMsg });
    setIsGenerating(true);

    const formatLabels: Record<string, string> = {
      talking_head_15: "Talking Head (15s, 4 cuts)",
      testimonial_15: "Testimonial (15s, 5 cuts)",
      educational_30: "Educational (30s, 8 cuts)",
      quick_tip_8: "Quick Tip (8s, 3 cuts)",
    };

    const statusMsg = addMessage({
      role: "assistant",
      content: `Building a **${formatLabels[selectedFormat] || selectedFormat}** with **${modelLabels[selectedModel]}**...`,
      showProgress: true,
    });

    activeStatusMsgIdRef.current = statusMsg.id;

    try {
      // 1. Create video record
      const createRes = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: userMsg.length > 100 ? userMsg.substring(0, 100) + "..." : userMsg,
          description: userMsg,
          script: userMsg,
          model: selectedModel,
          contentType: selectedFormat,
        }),
      });

      if (!createRes.ok) throw new Error("Failed to create video");
      const video = await createRes.json();

      // 2. Trigger format-first multi-cut generation
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: video.id,
          model: selectedModel,
          script: userMsg,
          format: selectedFormat,
        }),
      });

      const genData = genRes.ok ? await genRes.json() : null;
      const videoId = genData?.video?.id || video.id;

      // 3. Set videoData on the status message and start polling
      updateMessage(statusMsg.id, {
        videoData: {
          videoId,
          title: genData?.video?.title || video.title,
          model: selectedModel,
          status: "generating",
          videoUrl: null,
        },
      });

      // Start polling for progress
      setActiveVideoId(videoId);

    } catch (err: any) {
      updateMessage(statusMsg.id, {
        content: `Something went wrong: ${err.message}. Saved as a draft -- retry from the content library.`,
        showProgress: false,
      });
      setIsGenerating(false);
      setActiveVideoId(null);
    }
  };

  // ─── Approve video ─────────────────────────────────────────────

  const handleApprove = async (msgId: string, videoId: string) => {
    try {
      await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.videoData
            ? { ...m, videoData: { ...m.videoData, status: "approved" } }
            : m
        )
      );
      addMessage({
        role: "assistant",
        content: "Approved! The video is ready to publish. You can schedule it from the calendar or publish now.",
      });
    } catch {
      // Silent failure
    }
  };

  const handleRegenerate = async (msgId: string, videoId: string) => {
    setIsGenerating(true);
    try {
      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, model: selectedModel }),
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.videoData
            ? {
                ...m,
                showProgress: true,
                content: "Regenerating your video...",
                videoData: { ...m.videoData, status: "generating", videoUrl: null },
              }
            : m
        )
      );

      activeStatusMsgIdRef.current = msgId;
      setActiveVideoId(videoId);
    } catch {
      setIsGenerating(false);
    }
  };

  const handleRetry = async (msgId: string, videoId: string) => {
    setIsGenerating(true);
    try {
      const retryRes = await fetch("/api/generate/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      if (!retryRes.ok) {
        const errData = await retryRes.json().catch(() => ({}));
        throw new Error(errData.error || "Retry failed");
      }

      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          model: selectedModel,
          format: selectedFormat,
        }),
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.videoData
            ? {
                ...m,
                content: "Retrying generation...",
                showProgress: true,
                videoData: {
                  ...m.videoData,
                  status: "generating",
                  videoUrl: null,
                  error: undefined,
                },
              }
            : m
        )
      );

      activeStatusMsgIdRef.current = msgId;
      setActiveVideoId(videoId);
    } catch (err: any) {
      addMessage({
        role: "assistant",
        content: `Retry failed: ${err.message}`,
      });
      setIsGenerating(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 7rem - env(safe-area-inset-bottom, 0px))" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Create Video</h1>
          <p className="text-xs text-white/30 mt-0.5">Describe what you want and we will generate it</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Format Picker */}
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="px-3 py-2.5 min-h-[44px] rounded-xl border border-white/[0.06] bg-transparent text-[13px] text-white/60 hover:border-white/10 transition-all appearance-none cursor-pointer flex-1 sm:flex-none"
          >
            <option value="quick_tip_8" className="bg-[#0c1018]">Quick Tip (8s)</option>
            <option value="talking_head_15" className="bg-[#0c1018]">Talking Head (15s)</option>
            <option value="testimonial_15" className="bg-[#0c1018]">Testimonial (15s)</option>
            <option value="educational_30" className="bg-[#0c1018]">Educational (30s)</option>
          </select>

          {/* Model Picker */}
          <div className="relative" ref={modelPickerRef}>
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl border border-white/[0.06] text-[13px] text-white/60 hover:border-white/10 active:bg-white/[0.03] transition-all"
            >
              {selectedModel === "kling_2.6" ? (
                <><Cpu className="w-3.5 h-3.5 text-blue-400" /> <span className="hidden sm:inline">Kling 2.6</span><span className="sm:hidden">Kling</span></>
              ) : (
                <><Zap className="w-3.5 h-3.5 text-purple-400" /> <span className="hidden sm:inline">Seedance 2.0</span><span className="sm:hidden">Seedance</span></>
              )}
              <ChevronDown className="w-3 h-3 text-white/20" />
            </button>
            {showModelPicker && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-white/[0.06] bg-[#0c1018] p-1.5 z-50 shadow-2xl">
                {(["kling_2.6", "seedance_2.0"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setSelectedModel(m); setShowModelPicker(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left text-sm transition-all min-h-[48px] ${selectedModel === m ? "bg-white/[0.06]" : "hover:bg-white/[0.03] active:bg-white/[0.06]"}`}
                  >
                    {m === "kling_2.6" ? <Cpu className="w-4 h-4 text-blue-400" /> : <Zap className="w-4 h-4 text-purple-400" />}
                    <div>
                      <div className="text-[13px] font-medium text-white/80">{modelLabels[m]}</div>
                      <div className="text-[11px] text-white/25">{m === "kling_2.6" ? "Hyper-realistic" : "Creative & dynamic"}</div>
                    </div>
                    {selectedModel === m && <Check className="w-3.5 h-3.5 text-white/40 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-5 pb-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[90%]">
              <div className="flex items-start gap-3">
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-white/40" />
                  </div>
                )}
                <div className="flex-1">
                  <div className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-white/[0.06] border border-white/[0.04] rounded-br-md"
                      : "bg-transparent"
                  }`}>
                    {msg.content.split("**").map((part, i) =>
                      i % 2 === 1 ? <strong key={i} className="text-white font-medium">{part}</strong> : <span key={i} className="text-white/70">{part}</span>
                    )}
                  </div>

                  {/* Inline progress bar for generating videos */}
                  {msg.showProgress && msg.videoData?.status === "generating" && (
                    <div className="mt-3 px-4">
                      <GenerationProgressBar
                        progress={msg.id === activeStatusMsgIdRef.current ? progress : null}
                        compact
                      />
                    </div>
                  )}

                  {/* Template suggestions */}
                  {msg.templateSuggestions && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {msg.templateSuggestions.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          onClick={() => handleTemplateSelect(tmpl)}
                          className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.015] transition-all text-left"
                        >
                          <tmpl.icon className="w-4 h-4 text-white/20 flex-shrink-0" />
                          <div>
                            <div className="text-[13px] font-medium text-white/70">{tmpl.label}</div>
                            <div className="text-[11px] text-white/20 mt-0.5">{modelLabels[tmpl.model]}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Video result */}
                  {msg.videoData && (
                    <div className="mt-3">
                      <div className="rounded-xl border border-white/[0.04] overflow-hidden">
                        <div className="aspect-video bg-white/[0.02] relative flex items-center justify-center">
                          {msg.videoData.videoUrl ? (
                            <video src={msg.videoData.videoUrl} controls playsInline muted className="w-full h-full object-cover" />
                          ) : msg.videoData.status === "generating" ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
                              <span className="text-[11px] text-white/20">{msg.id === activeStatusMsgIdRef.current ? stepLabel : "Generating..."}</span>
                            </div>
                          ) : (
                            <Film className="w-8 h-8 text-white/[0.06]" />
                          )}
                          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur rounded-full">
                            {msg.videoData.model === "kling_2.6" ? <Cpu className="w-3 h-3 text-white/60" /> : <Zap className="w-3 h-3 text-white/60" />}
                            <span className="text-[10px] font-medium text-white/60">{modelLabels[msg.videoData.model] || msg.videoData.model}</span>
                          </div>
                          {msg.videoData.status === "approved" && (
                            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-green-500/80 backdrop-blur rounded-full">
                              <Check className="w-3 h-3 text-white" />
                              <span className="text-[10px] font-semibold text-white">Approved</span>
                            </div>
                          )}
                          {msg.videoData.status === "failed" && (
                            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-red-500/80 backdrop-blur rounded-full">
                              <X className="w-3 h-3 text-white" />
                              <span className="text-[10px] font-semibold text-white">Failed</span>
                            </div>
                          )}
                        </div>
                        <div className="px-4 py-3">
                          <div className="text-[13px] font-medium text-white/80 truncate">{msg.videoData.title}</div>
                        </div>
                      </div>

                      {msg.videoData.status === "review" && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleApprove(msg.id, msg.videoData!.videoId)}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-[#050508] text-[13px] font-medium hover:bg-white/90 transition-all"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => handleRegenerate(msg.id, msg.videoData!.videoId)}
                            disabled={isGenerating}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.06] text-[13px] text-white/50 hover:bg-white/[0.03] transition-all"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} /> Regenerate
                          </button>
                        </div>
                      )}

                      {msg.videoData.status === "failed" && (
                        <div className="mt-3 space-y-2">
                          {msg.videoData.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400/80">
                              {msg.videoData.error}
                            </div>
                          )}
                          <button
                            onClick={() => handleRetry(msg.id, msg.videoData!.videoId)}
                            disabled={isGenerating}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} /> Retry Generation
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 pt-4 border-t border-white/[0.04]">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Describe what you want to create..."
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 pr-14 text-[14px] text-white/80 placeholder:text-white/15 resize-none focus:outline-none focus:border-white/[0.12] transition-colors min-h-[48px] max-h-[120px]"
              rows={1}
              enterKeyHint="send"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isGenerating}
              className="absolute right-2 bottom-2 w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 disabled:opacity-10 flex items-center justify-center transition-colors"
            >
              <Send className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-white/15">
          <span className="flex items-center gap-1">
            {selectedModel === "kling_2.6" ? <Cpu className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
            {modelLabels[selectedModel]}
          </span>
          <span>·</span>
          <span>Enter to send</span>
        </div>
      </div>
    </div>
  );
}
