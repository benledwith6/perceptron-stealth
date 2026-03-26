"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Features", href: "/features" },
  { label: "Use cases", href: "/use-cases" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-white/[0.06] bg-[#050508]/90 backdrop-blur-xl shadow-lg shadow-black/20"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <Link href="/" className="text-[15px] font-semibold tracking-tight z-10">
            Official <span className="text-blue-400">AI</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 text-[13px] transition-colors rounded-lg hover:bg-white/[0.03] ${
                  pathname === link.href
                    ? "text-white/70"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3 z-10">
            <Link
              href="/auth/login"
              className="text-[13px] text-white/40 hover:text-white/70 transition-colors px-4 py-2"
            >
              Log in
            </Link>
            <Link
              href="/auth/signup"
              className="text-[13px] px-4 py-2 rounded-lg bg-white text-[#050508] font-medium hover:bg-white/90 transition-colors"
            >
              Start free trial
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden relative z-10 p-2.5 -mr-2 rounded-lg hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className="w-5 h-5 text-white/70" />
            ) : (
              <Menu className="w-5 h-5 text-white/70" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-all duration-300 ${
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className="absolute inset-0 bg-[#050508]/98 backdrop-blur-xl"
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`relative flex flex-col items-center justify-center h-full gap-2 transition-all duration-300 ${
            mobileOpen ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
          }`}
        >
          {navLinks.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-[18px] transition-colors py-3 px-8 min-h-[48px] flex items-center ${
                pathname === link.href
                  ? "text-white/90"
                  : "text-white/50 active:text-white/90"
              }`}
              style={{ transitionDelay: `${i * 50}ms` }}
            >
              {link.label}
            </Link>
          ))}

          <div className="w-12 h-px bg-white/[0.06] my-4" />

          <Link
            href="/auth/login"
            className="text-[16px] text-white/40 active:text-white/70 transition-colors py-3 px-8 min-h-[48px] flex items-center"
          >
            Log in
          </Link>
          <Link
            href="/auth/signup"
            className="mt-2 text-[15px] px-8 py-3.5 min-h-[48px] flex items-center justify-center rounded-xl bg-white text-[#050508] font-semibold active:bg-white/80 transition-colors"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </>
  );
}
