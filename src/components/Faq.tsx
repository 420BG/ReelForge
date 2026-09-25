"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { SectionHead, EmLime } from "./ui";

const FAQS = [
  {
    q: "Do I really never have to show my face?",
    a: "Correct. Every visual is generated or licensed, every voice is synthetic (or your clone). Channels built on ReelForge are faceless by design — some of the largest accounts on TikTok and Shorts already work this way.",
  },
  {
    q: "Who owns the videos the AI makes?",
    a: "You do. Every render comes with full commercial rights on every plan, including the free tier. Post them, monetize them, sell the channel built on them.",
  },
  {
    q: "Which platforms does auto-posting support?",
    a: "TikTok, YouTube Shorts and Instagram Reels natively. Connect once in settings and your series publishes on the schedule you choose — down to the minute, per platform.",
  },
  {
    q: "Can I edit the script or scenes before posting?",
    a: "Always. Autopilot drafts everything, but nothing ships without your approval unless you flip on full-auto mode. Regenerate any scene, swap voices mid-script, or rewrite a single line and the captions re-sync instantly.",
  },
  {
    q: "How does the virality score work?",
    a: "The engine grades each draft against retention patterns from tens of millions of shorts: hook strength, pacing, payoff timing and CTA friction. Anything below your threshold gets redrafted automatically before it can post.",
  },
  {
    q: "Is there really a free plan?",
    a: "Yes — three shorts a month, forever, no credit card. It's watermarked and capped at 720p, but it's the full pipeline: script, scenes, voice, captions and scheduling.",
  },
];

export default function Faq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <SectionHead
          tag="Questions"
          title={
            <>
              Asked <EmLime>constantly</EmLime>
            </>
          }
        />

        <div className="mt-14 space-y-3">
          {FAQS.map((f, i) => {
            const open = openIdx === i;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.05 }}
                className={`glass overflow-hidden rounded-2xl transition-colors ${open ? "border-lime/30" : ""}`}
              >
                <button
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-display text-base font-bold tracking-tight sm:text-lg">{f.q}</span>
                  <ChevronDown
                    className={`h-4.5 w-4.5 shrink-0 text-lime transition-transform duration-300 ${open ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <p className="px-6 pb-6 text-sm leading-relaxed text-mute">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
