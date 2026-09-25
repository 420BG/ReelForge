"use client";

import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { ArrowRight, Play, Star, CheckCircle2, Flame, CalendarClock } from "lucide-react";
import { useRef } from "react";
import Link from "next/link";
import PhonePlayer from "./PhonePlayer";
import { scrollToHash } from "./Navbar";
import { SAMPLE_SHORTS } from "@/lib/generator";
import { YouTubeIcon, TikTokIcon, InstagramIcon, EmLime } from "./ui";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.12 * i, duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  }),
};

const AVATARS = [
  { i: "MK", c: "from-violet to-fuchsia-500" },
  { i: "JD", c: "from-lime to-emerald-500" },
  { i: "AS", c: "from-sky-400 to-violet" },
  { i: "TP", c: "from-amber-400 to-rose-500" },
  { i: "RW", c: "from-fuchsia-500 to-violet" },
];

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yA = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const yB = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section id="top" ref={ref} className="relative overflow-hidden pb-16 pt-36 sm:pt-44">
      {/* backdrop */}
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent)]" />
      <div className="aurora-a absolute -top-40 left-[-10%] h-[560px] w-[560px] rounded-full bg-violet/25 blur-[140px]" />
      <div className="aurora-b absolute right-[-15%] top-1/3 h-[480px] w-[480px] rounded-full bg-lime/[0.07] blur-[140px]" />

      <motion.div style={{ opacity }} className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          {/* copy */}
          <div>
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
              <span className="inline-flex items-center gap-2 rounded-full border border-violet/30 bg-violet/10 px-4 py-1.5 text-xs font-semibold text-violet-soft">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
                </span>
                Series Autopilot 2.0 is live
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={1}
              className="mt-6 font-display text-[13.5vw] font-bold leading-[0.95] tracking-[-0.03em] sm:text-7xl lg:text-[5.2rem]"
            >
              Faceless videos,
              <br />
              <EmLime>on autopilot.</EmLime>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={2}
              className="mt-6 max-w-xl text-lg leading-relaxed text-mute"
            >
              ReelForge writes the script, paints every scene, narrates it with lifelike AI voices
              and posts it on schedule. You bring the niche —{" "}
              <span className="text-cream">the machine runs the channel.</span>
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={3}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <Link
                href="/studio"
                className="btn-sheen group flex h-14 items-center gap-2 rounded-full bg-lime px-7 text-base font-bold text-void transition hover:brightness-110"
              >
                Open the studio
                <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-1" />
              </Link>
              <button
                onClick={() => scrollToHash("#studio")}
                className="flex h-14 items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.03] px-6 text-base font-semibold text-cream transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-cream text-void">
                  <Play className="ml-0.5 h-3 w-3 fill-current" />
                </span>
                Watch it work
              </button>
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={4}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <div className="flex -space-x-2.5">
                {AVATARS.map((a) => (
                  <span
                    key={a.i}
                    className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br text-[10px] font-bold text-void ring-2 ring-void ${a.c}`}
                  >
                    {a.i}
                  </span>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1 text-lime">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                  <span className="ml-1.5 text-xs font-bold text-cream">4.9</span>
                </div>
                <p className="mt-0.5 text-xs text-dim">from 12,400+ faceless creators</p>
              </div>
            </motion.div>
          </div>

          {/* phones */}
          <div className="relative h-[520px] select-none sm:h-[600px]">
            <motion.div
              style={{ y: yA }}
              initial={{ opacity: 0, y: 60, rotate: -12 }}
              animate={{ opacity: 1, y: 0, rotate: -8 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
              className="absolute left-0 top-10 w-[218px] sm:w-[248px] lg:left-6"
            >
              <div className="pointer-events-none">
                <PhonePlayer short={SAMPLE_SHORTS[0]} mode="mini" autoPlay startDelay={600} loop />
              </div>
            </motion.div>

            <motion.div
              style={{ y: yB }}
              initial={{ opacity: 0, y: 80, rotate: 10 }}
              animate={{ opacity: 1, y: 0, rotate: 6 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
              className="absolute right-0 top-0 w-[238px] sm:w-[268px] lg:right-4"
            >
              <div className="pointer-events-none">
                <PhonePlayer short={SAMPLE_SHORTS[1]} mode="mini" autoPlay startDelay={1400} loop />
              </div>
            </motion.div>

            {/* floating chips */}
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.15, type: "spring", stiffness: 200, damping: 16 }}
              className="glass floaty absolute left-[46%] top-6 z-10 flex items-center gap-2 rounded-2xl px-3.5 py-2.5"
            >
              <CheckCircle2 className="h-4 w-4 text-lime" />
              <span className="text-xs font-semibold">Auto-posted to TikTok</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.35, type: "spring", stiffness: 200, damping: 16 }}
              className="glass floaty-slow absolute bottom-40 left-[38%] z-10 flex items-center gap-2 rounded-2xl px-3.5 py-2.5"
              style={{ animationDelay: "1.2s" }}
            >
              <Flame className="h-4 w-4 text-orange-400" />
              <span className="text-xs font-semibold">
                Virality <span className="text-lime">96</span>
              </span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.55, type: "spring", stiffness: 200, damping: 16 }}
              className="glass floaty absolute -bottom-2 right-[30%] z-10 flex items-center gap-2 rounded-2xl px-3.5 py-2.5"
              style={{ animationDelay: "2.4s" }}
            >
              <CalendarClock className="h-4 w-4 text-violet-soft" />
              <span className="text-xs font-semibold">Next post · 6:00 PM</span>
            </motion.div>
          </div>
        </div>

        {/* platform strip */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={5}
          className="mt-20 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-t border-white/[0.06] pt-8 text-mute"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-dim">
            Publishes natively to
          </span>
          {[
            { icon: <YouTubeIcon className="h-5 w-5" />, name: "YouTube Shorts" },
            { icon: <TikTokIcon className="h-5 w-5" />, name: "TikTok" },
            { icon: <InstagramIcon className="h-5 w-5" />, name: "Reels" },
          ].map((p) => (
            <span key={p.name} className="flex items-center gap-2.5 text-sm font-semibold text-cream/70 transition hover:text-cream">
              {p.icon}
              {p.name}
            </span>
          ))}
          <span className="hidden text-[11px] text-dim sm:inline">4K · 60fps · HDR-ready</span>
        </motion.div>
      </motion.div>
    </section>
  );
}
