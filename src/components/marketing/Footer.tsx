"use client";

import Link from "next/link";

const footerLinks = {
  Product: [
    { label: "How it works", href: "/how-it-works" },
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Use cases", href: "/use-cases" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
  ],
  Account: [
    { label: "Log in", href: "/auth/login" },
    { label: "Sign up", href: "/auth/signup" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-[15px] font-semibold tracking-tight">
              Official <span className="text-blue-400">AI</span>
            </Link>
            <p className="text-[13px] text-white/20 mt-3 leading-relaxed max-w-[200px]">
              Your AI twin, posting for you. Studio-quality video without filming.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-[12px] font-medium text-white/30 uppercase tracking-wider mb-4">
                {category}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-white/20 hover:text-white/50 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.04] mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[12px] text-white/15">
            &copy; {new Date().getFullYear()} Official AI. All rights reserved.
          </span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-[12px] text-white/10 hover:text-white/30 transition-colors">Privacy</Link>
            <Link href="/terms" className="text-[12px] text-white/10 hover:text-white/30 transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
