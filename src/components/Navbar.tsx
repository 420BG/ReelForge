"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowUpRight, LogOut } from "lucide-react";
import { Logo } from "./ui";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Playground", href: "#studio" },
  { label: "Features", href: "#features" },
  { label: "Voices", href: "#voices" },
  { label: "FAQ", href: "#faq" },
];

export function scrollToHash(href: string) {
  if (typeof window !== "undefined" && window.__lenis) {
    window.__lenis.scrollTo(href, { offset: -70, duration: 1.4 });
  } else {
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  }
}

async function lock() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (e: MouseEvent, href: string) => {
    e.preventDefault();
    setOpen(false);
    scrollToHash(href);
  };

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed inset-x-0 top-0 z-[80] transition-all duration-500 ${
          scrolled ? "border-b border-white/[0.06] bg-void/75 backdrop-blur-xl" : "bg-transparent"
        }`}
      >
        <nav className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="#top" onClick={(e) => go(e, "#top")} aria-label="ReelForge home">
            <Logo />
          </a>

          <div className="hidden items-center gap-7 lg:flex">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={(e) => go(e, l.href)}
                className="nav-link text-[13px] font-medium text-mute transition-colors hover:text-cream"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <button
              onClick={lock}
              className="flex items-center gap-1.5 text-[13px] font-medium text-mute transition-colors hover:text-cream"
            >
              <LogOut className="h-3.5 w-3.5" /> Lock
            </button>
            <Link
              href="/studio"
              className="btn-sheen flex items-center gap-1.5 rounded-full bg-cream px-4.5 py-2.5 text-[13px] font-bold text-void transition hover:bg-lime"
            >
              Open the studio <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <button
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
          </button>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex flex-col justify-between bg-void/95 px-6 pb-10 pt-28 backdrop-blur-2xl lg:hidden"
          >
            <div className="flex flex-col gap-2">
              {LINKS.map((l, i) => (
                <motion.a
                  key={l.href}
                  href={l.href}
                  onClick={(e) => go(e, l.href)}
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 * i }}
                  className="border-b border-white/[0.06] py-4 font-display text-3xl font-bold tracking-tight text-cream/90"
                >
                  {l.label}
                </motion.a>
              ))}
            </div>
            <Link
              href="/studio"
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-lime text-base font-bold text-void"
            >
              Open the studio <ArrowUpRight className="h-4 w-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
