"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Check, Minus, ChevronDown } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import CTASection from "@/components/marketing/CTASection";

const plans = [
  {
    name: "Starter",
    price: "$79",
    period: "/mo",
    description: "For professionals getting started with AI content.",
    features: [
      "10 videos per month",
      "3 platforms (choose any)",
      "Basic analytics",
      "Voice cloning",
      "AI digital twin",
      "Multi-cut composition",
      "Smart scripts",
      "Brand vault",
    ],
    cta: "Start free trial",
    href: "/auth/signup",
    popular: false,
  },
  {
    name: "Authority",
    price: "$149",
    period: "/mo",
    description: "For professionals serious about growing their presence.",
    features: [
      "30 videos per month",
      "All platforms",
      "Advanced analytics",
      "Priority generation",
      "Voice cloning",
      "AI digital twin",
      "Multi-cut composition",
      "Content calendar",
      "Smart scripts",
      "Brand vault",
    ],
    cta: "Start free trial",
    href: "/auth/signup",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For teams and agencies that need scale and control.",
    features: [
      "Unlimited videos",
      "All platforms",
      "Advanced analytics",
      "Priority generation",
      "Dedicated support",
      "Custom AI models",
      "API access",
      "Multi-user accounts",
      "Content calendar",
      "Brand vault",
    ],
    cta: "Contact sales",
    href: "/auth/signup",
    popular: false,
  },
];

const comparisonFeatures = [
  {
    category: "Content Creation",
    features: [
      { name: "Videos per month", starter: "10", authority: "30", enterprise: "Unlimited" },
      { name: "AI digital twin", starter: true, authority: true, enterprise: true },
      { name: "Multi-cut composition", starter: true, authority: true, enterprise: true },
      { name: "Voice cloning", starter: true, authority: true, enterprise: true },
      { name: "Smart scripts", starter: true, authority: true, enterprise: true },
      { name: "Custom AI models", starter: false, authority: false, enterprise: true },
    ],
  },
  {
    category: "Publishing",
    features: [
      { name: "Platforms", starter: "3", authority: "All", enterprise: "All" },
      { name: "Auto-posting", starter: true, authority: true, enterprise: true },
      { name: "Content calendar", starter: false, authority: true, enterprise: true },
      { name: "Optimal time scheduling", starter: false, authority: true, enterprise: true },
    ],
  },
  {
    category: "Analytics & Admin",
    features: [
      { name: "Basic analytics", starter: true, authority: true, enterprise: true },
      { name: "Advanced analytics", starter: false, authority: true, enterprise: true },
      { name: "Brand vault", starter: true, authority: true, enterprise: true },
      { name: "Multi-user accounts", starter: false, authority: false, enterprise: true },
      { name: "API access", starter: false, authority: false, enterprise: true },
    ],
  },
  {
    category: "Support",
    features: [
      { name: "Email support", starter: true, authority: true, enterprise: true },
      { name: "Priority generation", starter: false, authority: true, enterprise: true },
      { name: "Dedicated support", starter: false, authority: false, enterprise: true },
    ],
  },
];

const faqs = [
  {
    q: "How does the free trial work?",
    a: "Sign up and get your first 3 videos free, no credit card required. If you like what you see, choose a plan. If not, no hard feelings.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrade, downgrade, or cancel anytime. Changes take effect at the start of your next billing cycle.",
  },
  {
    q: "What platforms do you support?",
    a: "Instagram Reels, TikTok, LinkedIn, YouTube Shorts, and Facebook. Each video is automatically optimized for the platform it is posted to.",
  },
  {
    q: "How long does it take to get my first video?",
    a: "Under five minutes from signup to your first generated video. Upload your photos, pick a format, and the AI handles the rest.",
  },
  {
    q: "Will the videos actually look like me?",
    a: "Yes. The AI builds a detailed character model from your photos that maintains your likeness from every angle. This is not a face swap — it is a full digital twin.",
  },
  {
    q: "What if I do not like a video?",
    a: "Every video goes through your approval queue before posting. You can request revisions, edit the script, or reject it entirely. Nothing goes live without your approval.",
  },
  {
    q: "Do you offer annual pricing?",
    a: "Not yet. We are focused on making the product exceptional before locking people into long-term contracts. Monthly billing keeps us accountable.",
  },
  {
    q: "Is there a contract?",
    a: "No. Month-to-month billing. Cancel anytime, effective at the end of your current billing period.",
  },
];

function CellValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-[13px] text-white/50">{value}</span>;
  }
  return value ? (
    <Check className="w-4 h-4 text-white/40 mx-auto" />
  ) : (
    <Minus className="w-4 h-4 text-white/15 mx-auto" />
  );
}

export default function PricingClient() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none">
          <div className="absolute top-0 left-1/3 w-[400px] h-[400px] bg-blue-500/[0.03] rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-[13px] font-medium text-blue-400/70 uppercase tracking-widest mb-4">
            Pricing
          </p>
          <h1 className="text-[42px] sm:text-[56px] font-bold tracking-[-0.03em] leading-[1.08] text-white mb-6">
            Simple, transparent
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-blue-400 bg-clip-text text-transparent">
              pricing.
            </span>
          </h1>
          <p className="text-[17px] text-white/35 max-w-xl mx-auto leading-relaxed font-light">
            Start free. No credit card required. Upgrade when you are ready to
            scale your content production.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="pb-24 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`relative p-7 rounded-2xl border transition-all duration-300 ${
                plan.popular
                  ? "border-white/[0.1] bg-white/[0.025] scale-[1.02]"
                  : "border-white/[0.04] hover:border-white/[0.07] bg-white/[0.015]"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-7">
                  <span className="text-[11px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              <h3 className="text-[16px] font-semibold text-white/90 mt-1">
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1 mt-3 mb-2">
                <span className="text-[36px] font-bold text-white">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-[14px] text-white/20">{plan.period}</span>
                )}
              </div>
              <p className="text-[13px] text-white/25 mb-6">
                {plan.description}
              </p>

              <ul className="space-y-3 mb-8">
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
                href={plan.href}
                className={`block text-center text-[14px] font-medium py-3.5 min-h-[48px] flex items-center justify-center rounded-xl transition-all ${
                  plan.popular
                    ? "bg-white text-[#050508] hover:bg-white/90 active:bg-white/80"
                    : "border border-white/[0.08] text-white/50 hover:text-white/70 hover:border-white/[0.12] active:bg-white/[0.04]"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-14 text-center">
            <p className="text-[13px] font-medium text-blue-400/70 uppercase tracking-widest mb-3">
              Compare plans
            </p>
            <h2 className="text-[36px] sm:text-[40px] font-bold tracking-tight text-white">
              Feature comparison
            </h2>
          </div>

          <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-4 pr-4 text-[13px] font-medium text-white/30 w-[40%]" />
                  <th className="text-center py-4 px-4 text-[13px] font-medium text-white/50 w-[20%]">
                    Starter
                  </th>
                  <th className="text-center py-4 px-4 text-[13px] font-medium text-white/80 w-[20%]">
                    Authority
                  </th>
                  <th className="text-center py-4 px-4 text-[13px] font-medium text-white/50 w-[20%]">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((group) => (
                  <Fragment key={group.category}>
                    <tr>
                      <td
                        colSpan={4}
                        className="pt-8 pb-3 text-[12px] font-medium text-blue-400/60 uppercase tracking-widest"
                      >
                        {group.category}
                      </td>
                    </tr>
                    {group.features.map((feature, i) => (
                      <tr
                        key={`${group.category}-${i}`}
                        className="border-b border-white/[0.03]"
                      >
                        <td className="py-3.5 pr-4 text-[13px] text-white/40">
                          {feature.name}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <CellValue value={feature.starter} />
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <CellValue value={feature.authority} />
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <CellValue value={feature.enterprise} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto">
          <div className="mb-14 text-center">
            <p className="text-[13px] font-medium text-blue-400/70 uppercase tracking-widest mb-3">
              FAQ
            </p>
            <h2 className="text-[36px] sm:text-[40px] font-bold tracking-tight text-white">
              Common questions
            </h2>
          </div>

          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.04] hover:border-white/[0.06] transition-colors overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left min-h-[48px]"
                >
                  <span className="text-[14px] font-medium text-white/70 pr-4">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-white/20 flex-shrink-0 transition-transform duration-200 ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    openFaq === i ? "max-h-40" : "max-h-0"
                  }`}
                >
                  <p className="px-5 pb-5 text-[13px] text-white/30 leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        heading="Start your free trial."
        description="3 free videos. No credit card. See what AI content looks like with your face and voice."
        badge="No commitment, cancel anytime"
      />
    </MarketingLayout>
  );
}
