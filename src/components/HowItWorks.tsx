"use client";

import { motion, type Variants } from "framer-motion";
import { Target, Wand2, CalendarClock, Mic2 } from "lucide-react";
import { SectionHead, Em, TikTokIcon, YouTubeIcon, InstagramIcon } from "./ui";

const card: Variants = {
  hidden: { opacity: 0, y: 40 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.14 * i, duration: 0.75, ease: [0.22, 1, 0.36, 1] },
  }),
};

function NicheSketch() {
  const chips = ["Space", "Money", "History", "Psychology", "Ocean", "AI & Tech"];
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <span
          key={c}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            i === 0
              ? "bg-lime text-void"
              : "border border-white/10 bg-white/[0.03] text-mute"
          }`}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function ScriptSketch() {
  const lines = [
    { w: "92%", label: "HOOK" },
    { w: "78%", label: "TWIST" },
    { w: "85%", label: "PAYOFF" },
  ];
  return (
    <div className="mt-6 space-y-2.5">
      {lines.map((l, i) => (
        <motion.div
          key={l.label}
          initial={{ opacity: 0, x: -14 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 + i * 0.22, duration: 0.5 }}
          className="flex items-center gap-2.5"
        >
          <span className="w-14 shrink-0 text-[9px] font-bold tracking-[0.18em] text-violet-soft">{l.label}</span>
          <div className="h-2 rounded-full bg-white/10" style={{ width: l.w }}>
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ delay: 0.55 + i * 0.22, duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-violet to-violet-soft"
            />
          </div>
        </motion.div>
      ))}
      <div className="flex items-center gap-2 pt-1 text-mute">
        <Mic2 className="h-3.5 w-3.5 text-lime" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Atlas · narrating</span>
        <span className="eq text-lime" style={{ height: 12 }}>
          <span /><span /><span /><span /><span />
        </span>
      </div>
    </div>
  );
}

function ScheduleSketch() {
  return (
    <div className="mt-6">
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 14 }).map((_, i) => {
          const hot = [1, 3, 5, 8, 10, 12].includes(i);
          return (
            <div
              key={i}
              className={`flex h-8 items-center justify-center rounded-lg text-[10px] font-semibold ${
                hot ? "bg-lime/15 text-lime" : "bg-white/[0.04] text-dim"
              }`}
            >
              {i + 15}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="rounded-full bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-mute">
          Daily · 6:00 PM
        </span>
        <span className="flex items-center gap-2 text-mute">
          <TikTokIcon className="h-3.5 w-3.5" />
          <YouTubeIcon className="h-3.5 w-3.5" />
          <InstagramIcon className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    icon: Target,
    title: "Pick your niche",
    desc: "Choose from battle-tested viral niches or bring your own obsession. The engine studies what already wins.",
    sketch: <NicheSketch />,
  },
  {
    n: "02",
    icon: Wand2,
    title: "AI builds the short",
    desc: "Script, scenes, voiceover and karaoke captions — assembled in under a minute, scored for virality before it ever renders.",
    sketch: <ScriptSketch />,
  },
  {
    n: "03",
    icon: CalendarClock,
    title: "It posts itself",
    desc: "Connect TikTok, Shorts and Reels once. Your series publishes daily while you're asleep, at work, or on a beach.",
    sketch: <ScheduleSketch />,
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHead
          tag="The pipeline"
          title={
            <>
              Idea to uploaded in <Em>three beats</Em>
            </>
          }
          sub="No camera. No timeline. No 2 a.m. editing sessions. The entire production crew collapses into one pipeline."
        />

        <div className="relative mt-16 grid gap-5 lg:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-24 hidden border-t border-dashed border-white/15 lg:block" />
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              variants={card}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              custom={i}
              className="glass group relative overflow-hidden rounded-3xl p-8 transition-colors hover:border-violet/40"
            >
              <span className="text-stroke pointer-events-none absolute -right-2 -top-6 font-display text-[7rem] font-bold leading-none">
                {s.n}
              </span>
              <div className="relative">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-ink text-lime transition-colors group-hover:border-lime/40">
                  <s.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-display text-2xl font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-mute">{s.desc}</p>
                {s.sketch}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
