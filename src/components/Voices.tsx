"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, Square, AudioLines } from "lucide-react";
import { VOICES } from "@/lib/generator";
import { SectionHead, Em } from "./ui";

const GRAIDENTS = [
  "from-violet to-fuchsia-500",
  "from-sky-400 to-violet",
  "from-amber-400 to-rose-500",
  "from-lime to-emerald-500",
  "from-fuchsia-500 to-rose-500",
];

export default function Voices() {
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => () => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
  }, []);

  const toggle = (id: string) => {
    try {
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      if (playingId === id) {
        setPlayingId(null);
        return;
      }
      const v = VOICES.find((x) => x.id === id)!;
      const u = new SpeechSynthesisUtterance(v.sample);
      u.pitch = v.pitch;
      u.rate = v.rate;
      u.onend = () => setPlayingId(null);
      u.onerror = () => setPlayingId(null);
      setPlayingId(id);
      synth.speak(u);
    } catch {
      setPlayingId(null);
    }
  };

  return (
    <section id="voices" className="relative border-y border-white/[0.06] bg-ink/40 py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHead
          tag="The cast"
          title={
            <>
              Voices that <Em>stop the scroll</Em>
            </>
          }
          sub="Real neural narration, auditioned right here in your browser. Thirty-nine voices, five signature leads — no studio, no mic, no retakes."
        />

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {VOICES.map((v, i) => {
            const active = playingId === v.id;
            return (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={`glass group relative overflow-hidden rounded-3xl p-6 text-center transition-colors ${
                  active ? "border-lime/50" : "hover:border-violet/40"
                }`}
              >
                <div
                  className={`relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br font-display text-2xl font-bold text-void ${GRAIDENTS[i]}`}
                >
                  {v.name[0]}
                  {active && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-lime/30" />
                  )}
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">{v.name}</h3>
                <p className="mt-0.5 text-xs font-semibold text-violet-soft">{v.vibe}</p>
                <p className="mt-2 min-h-8 text-[11px] leading-relaxed text-dim">{v.bestFor}</p>
                <button
                  onClick={() => toggle(v.id)}
                  className={`mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full text-xs font-bold transition ${
                    active ? "bg-lime text-void" : "border border-white/12 text-cream hover:border-lime/50 hover:text-lime"
                  }`}
                >
                  {active ? (
                    <>
                      <Square className="h-3 w-3 fill-current" /> Stop
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 fill-current" /> Audition
                    </>
                  )}
                </button>
                {active && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-1 text-lime">
                    <span className="eq" style={{ height: 14 }}>
                      <span /><span /><span /><span /><span />
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-xs text-dim">
          <AudioLines className="h-4 w-4 text-lime" />
          Voice cloning available on the Studio plan — your voice, infinite shorts.
        </div>
      </div>
    </section>
  );
}
