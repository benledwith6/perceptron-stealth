"use client";

import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";

interface CTASectionProps {
  badge?: string;
  heading?: string;
  description?: string;
  buttonText?: string;
  buttonHref?: string;
}

export default function CTASection({
  badge = "Get your first video in 5 minutes",
  heading = "Ready to stop filming?",
  description = "Upload your photos and let AI handle the rest. Your social presence, automated.",
  buttonText = "Start free trial",
  buttonHref = "/auth/signup",
}: CTASectionProps) {
  return (
    <section className="py-28 px-6 border-t border-white/[0.04]">
      <div className="relative max-w-2xl mx-auto text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] pointer-events-none">
          <div className="absolute inset-0 bg-blue-500/[0.03] rounded-full blur-[80px]" />
        </div>

        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] mb-8">
            <Zap className="w-3 h-3 text-yellow-400/70" />
            <span className="text-[12px] text-white/40 font-medium">
              {badge}
            </span>
          </div>

          <h2 className="text-[36px] sm:text-[42px] font-bold tracking-tight text-white mb-4">
            {heading}
          </h2>
          <p className="text-[16px] text-white/30 mb-8 max-w-md mx-auto">
            {description}
          </p>
          <Link
            href={buttonHref}
            className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 min-h-[48px] w-full sm:w-auto rounded-xl bg-white text-[#050508] text-[15px] font-semibold hover:bg-white/90 active:bg-white/80 transition-all"
          >
            {buttonText}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}
