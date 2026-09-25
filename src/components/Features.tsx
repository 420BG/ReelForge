"use client";

import type { CSSProperties } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Flame,
  Mic2,
  Captions,
  Orbit,
  Languages,
  CalendarClock,
  TrendingUp,
} from "lucide-react";
import { SectionHead, Em, TikTokIcon, YouTubeIcon, InstagramIcon } from "./ui";

const cardCls =
  "glass group relative overflow-hidden rounded-3xl p-7 transition-colors duration-300 hover:border-violet/40";
const reveal: Variants = {
  hidden: { opacity: 0, y: 36 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  }),
};

function IconChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-ink text-lime">
      {children}
    </span>
  );
}

export default function Features() {
  return (
    <section id="features" className="relative py-28 sm:py-36">
      <div className="aurora-a absolute right-[-15%] top-0 h-[440px] w-[440px] rounded-full bg-lime/[0.05] blur-[150px]" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHead
          tag="Under the hood"
          title={
            <>
              A production crew, <Em>in a box</Em>
            </>
          }
          sub="Every short passes through six specialised systems before it earns the right to post."
        />

        <div className="mt-16 grid gap-5 lg:grid-cols-6">
          {/* hooks */}
          <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true }} custom={0} className={`${cardCls} lg:col-span-4`}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <IconChip><Flame className="h-5 w-5" /></IconChip>
                <h3 className="mt-5 font-display text-2xl font-bold tracking-tight">Scripts engineered to hook</h3>
                <p className="mt-2.5 max-w-md text-sm leading-relaxed text-mute">
                  Trained on 40M+ viral shorts. Every draft follows a proven retention curve —
                  cold-open hook, escalating tension, payoff, and a CTA that actually converts.
                </p>
              </div>
              <svg viewBox="0 0 120 80" className="hidden w-40 shrink-0 sm:block">
                <motion.path
                  d="M4 70 C 24 66, 34 30, 52 34 S 84 52, 116 8"
                  fill="none"
                  stroke="#D9FF4D"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.6, ease: "easeOut", delay: 0.3 }}
                />
                <text x="4" y="16" fill="#A4A3BB" fontSize="8" fontFamily="monospace">retention</text>
                <text x="86" y="76" fill="#A4A3BB" fontSize="8" fontFamily="monospace">+212%</text>
              </svg>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Cold-open hooks", "Escalation curves", "Payoff loops", "CTA sequencing"].map((t) => (
                <span key={t} className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-mute">
                  {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* voices */}
          <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true }} custom={1} className={`${cardCls} lg:col-span-2`}>
            <IconChip><Mic2 className="h-5 w-5" /></IconChip>
            <h3 className="mt-5 font-display text-xl font-bold tracking-tight">39 lifelike voices</h3>
            <p className="mt-2 text-sm leading-relaxed text-mute">Neural narration indistinguishable from a studio session.</p>
            <div className="mt-6 flex items-end gap-1.5 text-lime" style={{ height: 44 }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-current"
                  style={{
                    height: "100%",
                    transformOrigin: "bottom",
                    animation: `eq-bounce ${0.7 + (i % 5) * 0.13}s ease-in-out ${i * 0.07}s infinite`,
                  }}
                />
              ))}
            </div>
          </motion.div>

          {/* captions */}
          <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true }} custom={2} className={`${cardCls} lg:col-span-2`}>
            <IconChip><Captions className="h-5 w-5" /></IconChip>
            <h3 className="mt-5 font-display text-xl font-bold tracking-tight">Karaoke captions</h3>
            <p className="mt-2 text-sm leading-relaxed text-mute">Word-perfect timing, styled per niche.</p>
            <div className="mt-6 flex flex-wrap gap-1.5 font-display text-sm font-bold uppercase">
              {["Your", "brain", "is", "lying", "to", "you"].map((w, i) => (
                <span
                  key={i}
                  className="rounded-md px-1.5 py-0.5"
                  style={{
                    animation: `cap-pop 3s ease-in-out ${i * 0.45}s infinite`,
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  {w}
                </span>
              ))}
            </div>
            <style jsx>{`
              @keyframes cap-pop {
                0%, 100% { color: rgba(255, 255, 255, 0.4); background: transparent; }
                8%, 22% { color: #06060b; background: #d9ff4d; }
                30% { color: rgba(255, 255, 255, 0.4); background: transparent; }
              }
            `}</style>
          </motion.div>

          {/* autopilot */}
          <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true }} custom={3} className={`${cardCls} lg:col-span-4`}>
            <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-center">
              <div className="max-w-sm">
                <IconChip><Orbit className="h-5 w-5" /></IconChip>
                <h3 className="mt-5 font-display text-2xl font-bold tracking-tight">Series autopilot</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-mute">
                  Queue a whole month in one sitting. The forge keeps your series fed, varied and on
                  schedule — and pauses the moment a format starts to decay.
                </p>
                <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-lime">
                  <TrendingUp className="h-4 w-4" /> 30 shorts queued · posting daily at 6:00 PM
                </div>
              </div>
              {/* orbit visual */}
              <div className="relative mx-auto h-44 w-44 shrink-0">
                <div className="absolute inset-0 rounded-full border border-white/10" />
                <div className="absolute inset-6 rounded-full border border-dashed border-white/15" />
                <div className="absolute inset-0 spin-slower">
                  <span className="glass absolute -top-2 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full text-cream"><TikTokIcon className="h-4 w-4" /></span>
                  <span className="glass absolute -bottom-2 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full text-cream"><YouTubeIcon className="h-4 w-4" /></span>
                </div>
                <div className="absolute inset-6" style={{ animation: "orbit 14s linear infinite" }}>
                  <span className="glass absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-[60px] -translate-y-1/2 place-items-center rounded-full text-cream"><InstagramIcon className="h-4 w-4" /></span>
                </div>
                <span className="pulse-ring absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-lime text-void">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M8 5v14l11-7z" /></svg>
                </span>
              </div>
            </div>
          </motion.div>

          {/* languages */}
          <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true }} custom={4} className={`${cardCls} lg:col-span-3`}>
            <IconChip><Languages className="h-5 w-5" /></IconChip>
            <h3 className="mt-5 font-display text-xl font-bold tracking-tight">32 languages</h3>
            <p className="mt-2 text-sm leading-relaxed text-mute">One niche, thirty-two markets. Clone a series across languages in a click.</p>
            <div className="mask-fade-x mt-6 overflow-hidden">
              <div className="marquee-track" style={{ "--marquee-dur": "26s" } as CSSProperties}>
                {[...["English", "Español", "Français", "Deutsch", "Português", "日本語", "हिन्दी", "العربية", "한국어", "Italiano"], ...["English", "Español", "Français", "Deutsch", "Português", "日本語", "हिन्दी", "العربية", "한국어", "Italiano"]].map((l, i) => (
                  <span key={i} className="mx-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-mute">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* schedule */}
          <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true }} custom={5} className={`${cardCls} lg:col-span-3`}>
            <IconChip><CalendarClock className="h-5 w-5" /></IconChip>
            <h3 className="mt-5 font-display text-xl font-bold tracking-tight">Set-and-forget schedule</h3>
            <p className="mt-2 text-sm leading-relaxed text-mute">Peak-hour posting per platform, tuned automatically.</p>
            <div className="mt-6 grid grid-cols-7 gap-1.5">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <span className="text-[9px] font-bold tracking-widest text-dim">{d}</span>
                  <div className={`flex h-10 w-full items-center justify-center rounded-xl border ${i < 6 ? "border-lime/30 bg-lime/10" : "border-white/10 bg-white/[0.02]"}`}>
                    {i < 6 ? <span className="h-1.5 w-1.5 rounded-full bg-lime" /> : <span className="h-1.5 w-1.5 rounded-full bg-white/15" />}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
