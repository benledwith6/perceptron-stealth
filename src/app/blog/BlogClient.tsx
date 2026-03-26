"use client";

import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import CTASection from "@/components/marketing/CTASection";

const posts = [
  {
    slug: "multi-cut-method",
    title: "The Multi-Cut Method: Why One-Shot AI Video Looks Like Garbage",
    excerpt:
      "Every AI video tool generates a single continuous shot from a prompt. That is why they all look fake. Here is how multi-cut composition changes everything.",
    category: "Technology",
    readTime: "6 min read",
    date: "March 18, 2026",
    featured: true,
    comingSoon: false,
  },
  {
    slug: "ai-ugc-future",
    title: "Why AI-Generated UGC Is the Future of Professional Content",
    excerpt:
      "The content that performs best is not polished corporate video. It is raw, face-to-camera UGC. AI is about to make that accessible to every professional.",
    category: "Industry",
    readTime: "5 min read",
    date: "March 12, 2026",
    featured: false,
    comingSoon: true,
  },
  {
    slug: "real-estate-agents-ai",
    title: "How Real Estate Agents Are Using AI to Post Daily Without Filming",
    excerpt:
      "The top-producing agents post content daily. Most agents post once a month. AI is closing that gap for agents who know their stuff but hate being on camera.",
    category: "Use Cases",
    readTime: "7 min read",
    date: "March 6, 2026",
    featured: false,
    comingSoon: true,
  },
  {
    slug: "five-content-formats",
    title: "5 Content Formats That Work for Every Industry",
    excerpt:
      "Not all content formats work for all professionals. But these five formats consistently drive engagement regardless of industry, audience, or platform.",
    category: "Strategy",
    readTime: "4 min read",
    date: "February 28, 2026",
    featured: false,
    comingSoon: true,
  },
];

const categoryColors: Record<string, string> = {
  Technology: "text-blue-400/70 bg-blue-500/10 border-blue-500/20",
  Industry: "text-violet-400/70 bg-violet-500/10 border-violet-500/20",
  "Use Cases": "text-emerald-400/70 bg-emerald-500/10 border-emerald-500/20",
  Strategy: "text-amber-400/70 bg-amber-500/10 border-amber-500/20",
};

export default function BlogClient() {
  const featured = posts.find((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none">
          <div className="absolute top-0 left-1/3 w-[400px] h-[400px] bg-blue-500/[0.03] rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-[13px] font-medium text-blue-400/70 uppercase tracking-widest mb-4">
            Blog
          </p>
          <h1 className="text-[42px] sm:text-[56px] font-bold tracking-[-0.03em] leading-[1.08] text-white mb-6">
            Insights on AI content
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-blue-400 bg-clip-text text-transparent">
              and professional growth.
            </span>
          </h1>
          <p className="text-[17px] text-white/35 max-w-xl mx-auto leading-relaxed font-light">
            How AI is changing content creation for professionals. Strategy,
            technology, and real results.
          </p>
        </div>
      </section>

      {/* Featured post */}
      {featured && (
        <section className="pb-16 px-6">
          <div className="max-w-4xl mx-auto">
            <Link
              href={`/blog/${featured.slug}`}
              className="group block p-8 sm:p-10 rounded-2xl border border-white/[0.04] bg-white/[0.015] hover:border-white/[0.08] hover:bg-white/[0.025] transition-all duration-300"
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                    categoryColors[featured.category] || "text-white/40 bg-white/[0.04] border-white/[0.06]"
                  }`}
                >
                  {featured.category}
                </span>
                <span className="text-[12px] text-white/20">{featured.date}</span>
              </div>

              <h2 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-white/90 mb-3 group-hover:text-white transition-colors">
                {featured.title}
              </h2>
              <p className="text-[15px] text-white/30 leading-relaxed mb-6 max-w-2xl">
                {featured.excerpt}
              </p>

              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-white/20">
                  <Clock className="w-3 h-3" />
                  {featured.readTime}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[13px] text-blue-400/70 group-hover:text-blue-400 transition-colors">
                  Read article
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Post grid */}
      <section className="pb-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {rest.map((post) => {
              const Wrapper = post.comingSoon ? "div" : Link;
              const wrapperProps = post.comingSoon
                ? { className: "group p-6 rounded-2xl border border-white/[0.04] bg-white/[0.015] opacity-60 cursor-default" }
                : { href: `/blog/${post.slug}`, className: "group p-6 rounded-2xl border border-white/[0.04] bg-white/[0.015] hover:border-white/[0.08] hover:bg-white/[0.025] transition-all duration-300" };
              return (
                <Wrapper key={post.slug} {...(wrapperProps as any)}>
                  <div className="flex items-center gap-2 mb-4">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        categoryColors[post.category] || "text-white/40 bg-white/[0.04] border-white/[0.06]"
                      }`}
                    >
                      {post.category}
                    </span>
                    {post.comingSoon && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-white/30 bg-white/[0.04] border-white/[0.06]">
                        Coming Soon
                      </span>
                    )}
                  </div>

                  <h3 className="text-[15px] font-semibold text-white/80 mb-2 leading-snug group-hover:text-white transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-[12px] text-white/25 leading-relaxed mb-4">
                    {post.excerpt}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/15">{post.date}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-white/15">
                      <Clock className="w-2.5 h-2.5" />
                      {post.readTime}
                    </span>
                  </div>
                </Wrapper>
              );
            })}
          </div>
        </div>
      </section>

      <CTASection
        heading="See it for yourself."
        description="Stop reading about AI content. Start creating it. Your first video is free."
        badge="Free to try, no credit card required"
      />
    </MarketingLayout>
  );
}
