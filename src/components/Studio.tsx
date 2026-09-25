"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dices,
  Zap,
  PenLine,
  Mic2,
  Image as ImageIcon,
  Captions,
  Clapperboard,
  Check,
  Loader2,
  Radio,
  ChevronDown,
  Flame,
  Volume2,
} from "lucide-react";
import {
  NICHES,
  VOICES,
  STYLES,
  generateShort,
  type GeneratedShort,
  type NicheId,
  type VoiceId,
  type StyleId,
} from "@/lib/generator";
import PhonePlayer from "./PhonePlayer";
import { SectionHead, EmLime } from "./ui";

const PIPELINE = [
  { icon: PenLine, label: "Writing the script" },
  { icon: Mic2, label: "Casting the voice" },
  { icon: ImageIcon, label: "Painting the scenes" },
  { icon: Captions, label: "Syncing karaoke captions" },
  { icon: Clapperboard, label: "Rendering 4K master" },
];

interface FeedItem {
  id: string;
  topic: string;
  niche: string;
  title: string;
  score: number;
  voice: string;
  createdAt: string;
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Studio() {
  const [topic, setTopic] = useState("black holes");
  const [niche, setNiche] = useState<NicheId>("space");
  const [voice, setVoice] = useState<VoiceId>("atlas");
  const [style, setStyle] = useState<StyleId>("cinematic");
  const [variant, setVariant] = useState(0);
  const [phase, setPhase] = useState<"idle" | "forging" | "ready">("idle");
  const [stage, setStage] = useState(0);
  const [short, setShort] = useState<GeneratedShort>(() =>
    generateShort({ topic: "black holes", niche: "space", voice: "atlas", style: "cinematic" }),
  );
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [forged, setForged] = useState(false);
  const phoneRef = useRef<HTMLDivElement>(null);

  const loadFeed = useCallback(() => {
    fetch("/api/generations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFeed(d.items))
      .catch(() => {});
  }, []);

  useEffect(() => loadFeed(), [loadFeed]);

  const randomTopic = () => {
    const bank = NICHES.find((n) => n.id === niche)!.topics;
    setTopic(bank[Math.floor(Math.random() * bank.length)]);
  };

  const audition = (v: (typeof VOICES)[number]) => {
    try {
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(v.sample);
      u.pitch = v.pitch;
      u.rate = v.rate;
      synth.speak(u);
    } catch {
      /* no audio available */
    }
  };

  const forge = async () => {
    if (phase === "forging") return;
    setPhase("forging");
    setForged(true);
    setStage(0);
    setShowTranscript(false);

    const stageTimer = setInterval(() => {
      setStage((s) => Math.min(s + 1, PIPELINE.length - 1));
    }, 720);

    const nextVariant = variant + 1;
    setVariant(nextVariant);

    try {
      const [res] = await Promise.all([
        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, niche, voice, style, variant: nextVariant }),
        }),
        new Promise((r) => setTimeout(r, 3800)),
      ]);
      clearInterval(stageTimer);
      setStage(PIPELINE.length - 1);
      if (res.ok) {
        const data = await res.json();
        setShort(data.short);
        loadFeed();
      } else {
        setShort(generateShort({ topic, niche, voice, style, variant: nextVariant }));
      }
    } catch {
      clearInterval(stageTimer);
      setShort(generateShort({ topic, niche, voice, style, variant: nextVariant }));
    }
    await new Promise((r) => setTimeout(r, 500));
    setPhase("ready");
    phoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const nicheMeta = useMemo(() => NICHES.find((n) => n.id === niche)!, [niche]);

  return (
    <section id="studio" className="relative py-28 sm:py-36">
      <div className="aurora-b absolute left-[-20%] top-1/4 h-[500px] w-[500px] rounded-full bg-violet/15 blur-[160px]" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHead
          tag="Live demo"
          title={
            <>
              Step into <EmLime>the Forge</EmLime>
            </>
          }
          sub="This isn't a mockup. Type a topic, hit forge, and the pipeline writes, voices, scores and plays your short — then files it in our live database."
        />

        <div className="mt-16 grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          {/* control deck */}
          <div className="glass-deep rounded-3xl p-6 sm:p-8">
            {/* topic */}
            <label className="text-[11px] font-bold uppercase tracking-[0.22em] text-dim">
              Topic
            </label>
            <div className="mt-2.5 flex gap-2">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. the psychology of focus"
                maxLength={80}
                className="h-13 flex-1 rounded-2xl border border-white/12 bg-white/[0.04] px-5 text-[15px] text-cream outline-none transition placeholder:text-dim focus:border-lime/50"
              />
              <button
                onClick={randomTopic}
                aria-label="Random topic"
                title="Surprise me"
                className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl border border-white/12 bg-white/[0.04] text-mute transition hover:border-lime/40 hover:text-lime"
              >
                <Dices className="h-5 w-5" />
              </button>
            </div>

            {/* niche */}
            <label className="mt-7 block text-[11px] font-bold uppercase tracking-[0.22em] text-dim">
              Niche
            </label>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {NICHES.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setNiche(n.id)}
                  className={`flex items-center gap-2 rounded-2xl border px-3.5 py-3 text-left text-[13px] font-semibold transition ${
                    niche === n.id
                      ? "border-lime/60 bg-lime/[0.08] text-cream"
                      : "border-white/10 bg-white/[0.02] text-mute hover:border-white/25 hover:text-cream"
                  }`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: n.hue }} />
                  {n.label}
                </button>
              ))}
            </div>

            {/* voice */}
            <label className="mt-7 block text-[11px] font-bold uppercase tracking-[0.22em] text-dim">
              Narrator
            </label>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {VOICES.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center overflow-hidden rounded-full border transition ${
                    voice === v.id ? "border-lime/60 bg-lime/[0.08]" : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <button
                    onClick={() => setVoice(v.id)}
                    className={`px-4 py-2.5 text-[13px] font-semibold transition ${
                      voice === v.id ? "text-cream" : "text-mute hover:text-cream"
                    }`}
                  >
                    {v.name}
                    <span className="ml-2 hidden text-[10px] font-normal text-dim sm:inline">{v.vibe}</span>
                  </button>
                  <button
                    onClick={() => audition(v)}
                    aria-label={`Preview ${v.name}`}
                    className="border-l border-white/10 px-3 py-2.5 text-mute transition hover:text-lime"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* style */}
            <label className="mt-7 block text-[11px] font-bold uppercase tracking-[0.22em] text-dim">
              Visual style
            </label>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`rounded-full border px-4.5 py-2.5 text-[13px] font-semibold transition ${
                    style === s.id
                      ? "border-lime/60 bg-lime/[0.08] text-cream"
                      : "border-white/10 bg-white/[0.02] text-mute hover:border-white/25 hover:text-cream"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* forge button */}
            <button
              onClick={forge}
              disabled={phase === "forging" || !topic.trim()}
              className="btn-sheen mt-8 flex h-15 w-full items-center justify-center gap-2.5 rounded-2xl bg-lime text-base font-bold text-void transition hover:brightness-110 disabled:opacity-50"
            >
              {phase === "forging" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Forging…
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5 fill-current" /> Forge the short
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[11px] text-dim">
              1 credit · ~{short.duration.toFixed(0)}s runtime · saved to the live gallery below
            </p>

            {/* pipeline stepper */}
            <AnimatePresence>
              {phase === "forging" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 space-y-2 rounded-2xl border border-white/[0.08] bg-void/60 p-4">
                    {PIPELINE.map((p, i) => {
                      const done = i < stage;
                      const active = i === stage;
                      return (
                        <div key={p.label} className="flex items-center gap-3">
                          <span
                            className={`grid h-7 w-7 place-items-center rounded-full border transition ${
                              done
                                ? "border-lime/50 bg-lime/15 text-lime"
                                : active
                                  ? "border-violet/60 bg-violet/15 text-violet-soft"
                                  : "border-white/10 text-dim"
                            }`}
                          >
                            {done ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : active ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <p.icon className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className={`text-sm ${done || active ? "text-cream" : "text-dim"}`}>
                            {p.label}
                          </span>
                          {active && (
                            <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.18em] text-violet-soft">
                              running
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* player column */}
          <div ref={phoneRef} className="relative mx-auto w-full max-w-[330px] scroll-mt-28">
            <div className="absolute -inset-8 rounded-[3rem] bg-violet/20 blur-3xl" />
            <div className="relative">
              <PhonePlayer
                key={forged ? `${short.topic}-${variant}` : "initial"}
                short={short}
                autoPlay={phase === "ready"}
                onForgeAnother={() => setPhase("idle")}
              />

              {/* forging overlay */}
              <AnimatePresence>
                {phase === "forging" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 rounded-[2.4rem] bg-void/85 backdrop-blur-md"
                  >
                    <div className="shimmer h-2 w-32 rounded-full" />
                    <div className="shimmer h-2 w-44 rounded-full" style={{ animationDelay: "0.15s" }} />
                    <div className="shimmer h-2 w-24 rounded-full" style={{ animationDelay: "0.3s" }} />
                    <p className="mt-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-soft">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {PIPELINE[stage].label}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* result meta */}
            <AnimatePresence>
              {phase === "ready" && (
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="glass relative z-10 mt-5 rounded-2xl p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold">{short.title}</p>
                      <p className="mt-0.5 text-[11px] text-dim">
                        {nicheMeta.label} · {short.duration.toFixed(1)}s · {VOICES.find((v) => v.id === short.voice)?.name}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-lime/15 px-2.5 py-1.5 text-xs font-bold text-lime">
                      <Flame className="h-3.5 w-3.5" /> {short.score}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowTranscript((s) => !s)}
                    className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-xs font-semibold text-mute transition hover:text-cream"
                  >
                    View transcript
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTranscript ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {showTranscript && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="max-h-44 space-y-2.5 overflow-y-auto pt-3 no-scrollbar">
                          {short.scenes.map((s, i) => (
                            <p key={i} className="text-xs leading-relaxed text-mute">
                              <span className="mr-2 font-bold uppercase tracking-wider text-violet-soft">
                                {s.beat}
                              </span>
                              {s.text}
                            </p>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* live feed */}
        <div className="mt-20">
          <div className="mb-6 flex items-center justify-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.26em] text-dim">
            <Radio className="h-3.5 w-3.5 text-lime" />
            Fresh from the forge — live from the database
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {feed.slice(0, 6).map((f, i) => {
              const hue = NICHES.find((n) => n.id === f.niche)?.hue ?? "#8B7CFF";
              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="glass flex items-center gap-3.5 rounded-2xl px-4.5 py-4"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hue }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-[11px] text-dim">
                      {timeAgo(f.createdAt)} · voice {f.voice}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold text-lime">
                    <Flame className="h-3 w-3" />
                    {f.score}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
