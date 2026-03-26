"use client";

import Link from "next/link";
import { ArrowRight, Check, Zap, Camera, Sparkles, Send } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";

export default function LandingPageClient() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6">
        {/* Subtle gradient orbs */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-blue-500/[0.04] rounded-full blur-[120px]" />
          <div className="absolute top-20 right-1/4 w-[300px] h-[300px] bg-purple-500/[0.04] rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[12px] text-white/40 font-medium">
              Now in beta
            </span>
          </div>

          <h1 className="text-[46px] sm:text-[64px] font-bold tracking-[-0.03em] leading-[1.05] text-white mb-6">
            Your AI twin.
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-blue-400 bg-clip-text text-transparent">
              Posting for you.
            </span>
          </h1>

          <p className="text-[17px] sm:text-[19px] text-white/35 max-w-xl mx-auto mb-10 leading-relaxed font-light">
            Upload a few photos. Get studio-quality social media videos
            featuring your face and voice. No filming. No editing. No crew.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <Link
              href="/auth/signup"
              className="group inline-flex items-center justify-center gap-2.5 px-7 py-3.5 min-h-[48px] w-full sm:w-auto rounded-xl bg-white text-[#050508] text-[15px] font-semibold hover:bg-white/90 active:bg-white/80 transition-all"
            >
              Start free trial
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 min-h-[48px] w-full sm:w-auto rounded-xl text-[15px] text-white/40 hover:text-white/60 active:text-white/70 transition-all"
            >
              See how it works
            </Link>
          </div>

          <p className="text-[13px] text-white/15">
            No credit card required
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/[0.04] py-12 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "90%", label: "Less time creating" },
            { value: "60x", label: "More views on average" },
            { value: "5 min", label: "Setup to first video" },
            { value: "$79", label: "Per month to start" },
          ].map((stat, i) => (
            <div key={i} className="space-y-1">
              <div className="text-[32px] font-bold tracking-tight text-white">
                {stat.value}
              </div>
              <div className="text-[13px] text-white/25">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section id="how" className="py-28 px-6 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-14">
            <p className="text-[13px] font-medium text-blue-400/70 uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="text-[36px] sm:text-[40px] font-bold tracking-tight text-white leading-tight">
              Three steps. Five minutes.
              <br />
              <span className="text-white/40">Content on autopilot.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: Camera,
                num: "01",
                title: "Upload your photos",
                desc: "A few selfies or headshots from your phone. The AI builds a consistent character model of you for every video.",
                accent: "from-blue-500/20 to-blue-500/0",
              },
              {
                icon: Sparkles,
                num: "02",
                title: "AI creates your content",
                desc: "Type what you want or let AI decide. It writes the script, plans the shots, and builds a multi-cut video that looks professionally produced.",
                accent: "from-violet-500/20 to-violet-500/0",
              },
              {
                icon: Send,
                num: "03",
                title: "Review and publish",
                desc: "Every video hits your approval queue first. Approve it, schedule it, and it auto-posts to Instagram, TikTok, LinkedIn, YouTube, and Facebook.",
                accent: "from-emerald-500/20 to-emerald-500/0",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="group relative p-6 rounded-2xl border border-white/[0.04] bg-white/[0.015] hover:border-white/[0.08] hover:bg-white/[0.025] transition-all duration-300"
              >
                <div
                  className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${step.accent}`}
                />
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-5 group-hover:border-white/[0.1] transition-colors">
                  <step.icon className="w-4.5 h-4.5 text-white/40" />
                </div>
                <div className="text-[11px] text-white/15 font-mono mb-2">
                  {step.num}
                </div>
                <h3 className="text-[16px] font-semibold text-white/90 mb-2.5">
                  {step.title}
                </h3>
                <p className="text-[13px] text-white/30 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/how-it-works"
              className="text-[13px] text-blue-400/70 hover:text-blue-400 transition-colors"
            >
              Learn more about our process &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-28 px-6 border-t border-white/[0.04] scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-14">
            <p className="text-[13px] font-medium text-blue-400/70 uppercase tracking-widest mb-3">
              What you get
            </p>
            <h2 className="text-[36px] sm:text-[40px] font-bold tracking-tight text-white leading-tight">
              A content team
              <br />
              <span className="text-white/40">that never sleeps.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: "AI video generation",
                desc: "Multiple models (Kling 2.6, Seedance 2.0, Sora 2) generate studio-quality video from your photos.",
              },
              {
                title: "Multi-cut composition",
                desc: "Every video is 3-8 separate cuts stitched together with hooks, B-roll, and CTAs. Never one-shot AI slop.",
              },
              {
                title: "Auto-posting",
                desc: "Schedule and publish to Instagram, TikTok, LinkedIn, YouTube, and Facebook from one dashboard.",
              },
              {
                title: "Smart scripts",
                desc: "AI writes scripts using proven frameworks from top creators. Hooks that stop the scroll.",
              },
              {
                title: "Your face, your voice",
                desc: "Character sheets and voice cloning ensure every video looks and sounds like you. Not a generic avatar.",
              },
              {
                title: "Analytics",
                desc: "Track views, likes, shares, and comments across all platforms in one place.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="p-5 rounded-xl border border-white/[0.04] hover:border-white/[0.07] transition-colors"
              >
                <h3 className="text-[15px] font-medium text-white/80 mb-1.5">
                  {feature.title}
                </h3>
                <p className="text-[13px] text-white/25 leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/features"
              className="text-[13px] text-blue-400/70 hover:text-blue-400 transition-colors"
            >
              See all features &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="py-28 px-6 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-14">
            <p className="text-[13px] font-medium text-blue-400/70 uppercase tracking-widest mb-3">
              Built for
            </p>
            <h2 className="text-[36px] sm:text-[40px] font-bold tracking-tight text-white leading-tight">
              Professionals who need
              <br />
              <span className="text-white/40">to be everywhere.</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                title: "Real Estate",
                desc: "Listing tours, market updates, testimonials",
              },
              {
                title: "Legal",
                desc: "Know-your-rights, case results, legal tips",
              },
              {
                title: "Medical",
                desc: "Health tips, procedure explainers, wellness",
              },
              {
                title: "Creators",
                desc: "Brand intros, thought leadership, daily tips",
              },
            ].map((ind, i) => (
              <div
                key={i}
                className="p-5 rounded-xl border border-white/[0.04] hover:border-white/[0.07] transition-colors"
              >
                <h3 className="text-[15px] font-medium text-white/80 mb-1.5">
                  {ind.title}
                </h3>
                <p className="text-[12px] text-white/20 leading-relaxed">
                  {ind.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/use-cases"
              className="text-[13px] text-blue-400/70 hover:text-blue-400 transition-colors"
            >
              Explore all use cases &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-28 px-6 border-t border-white/[0.04] scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[13px] font-medium text-blue-400/70 uppercase tracking-widest mb-3">
              Pricing
            </p>
            <h2 className="text-[36px] sm:text-[40px] font-bold tracking-tight text-white mb-3">
              Simple, transparent pricing
            </h2>
            <p className="text-[15px] text-white/25">
              Start free. Upgrade when you are ready.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[
              {
                name: "Starter",
                price: "$79",
                features: [
                  "10 videos per month",
                  "3 platforms",
                  "Basic analytics",
                  "Voice cloning",
                ],
              },
              {
                name: "Authority",
                price: "$149",
                features: [
                  "30 videos per month",
                  "All platforms",
                  "Advanced analytics",
                  "Priority generation",
                ],
                popular: true,
              },
              {
                name: "Enterprise",
                price: "Custom",
                features: [
                  "Unlimited videos",
                  "Dedicated support",
                  "Custom models",
                  "API access",
                ],
              },
            ].map((plan, i) => (
              <div
                key={i}
                className={`relative p-6 rounded-2xl border transition-colors ${
                  plan.popular
                    ? "border-white/[0.1] bg-white/[0.025]"
                    : "border-white/[0.04] hover:border-white/[0.07]"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-6">
                    <span className="text-[11px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
                      Most popular
                    </span>
                  </div>
                )}
                <h3 className="text-[15px] font-semibold text-white/90 mt-1">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mt-3 mb-6">
                  <span className="text-[32px] font-bold text-white">
                    {plan.price}
                  </span>
                  {plan.price !== "Custom" && (
                    <span className="text-[13px] text-white/20">/mo</span>
                  )}
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((f, j) => (
                    <li
                      key={j}
                      className="flex items-center gap-2.5 text-[13px] text-white/40"
                    >
                      <Check className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/signup"
                  className={`flex items-center justify-center text-center text-[13px] font-medium py-3 min-h-[44px] rounded-lg transition-all ${
                    plan.popular
                      ? "bg-white text-[#050508] hover:bg-white/90 active:bg-white/80"
                      : "border border-white/[0.08] text-white/50 hover:text-white/70 hover:border-white/[0.12] active:bg-white/[0.04]"
                  }`}
                >
                  {plan.price === "Custom" ? "Contact sales" : "Start free trial"}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="text-[13px] text-blue-400/70 hover:text-blue-400 transition-colors"
            >
              Compare all plans &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 px-6 border-t border-white/[0.04]">
        <div className="relative max-w-2xl mx-auto text-center">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] pointer-events-none">
            <div className="absolute inset-0 bg-blue-500/[0.03] rounded-full blur-[80px]" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] mb-8">
              <Zap className="w-3 h-3 text-yellow-400/70" />
              <span className="text-[12px] text-white/40 font-medium">
                Get your first video in 5 minutes
              </span>
            </div>

            <h2 className="text-[36px] sm:text-[42px] font-bold tracking-tight text-white mb-4">
              Ready to stop filming?
            </h2>
            <p className="text-[16px] text-white/30 mb-8 max-w-md mx-auto">
              Upload your photos and let AI handle the rest. Your social
              presence, automated.
            </p>
            <Link
              href="/auth/signup"
              className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 min-h-[48px] w-full sm:w-auto rounded-xl bg-white text-[#050508] text-[15px] font-semibold hover:bg-white/90 active:bg-white/80 transition-all"
            >
              Start free trial
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
