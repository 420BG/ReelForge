"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Download,
  Check,
  Flame,
  Loader2,
} from "lucide-react";
import type { GeneratedShort, ScriptScene } from "@/lib/generator";
import { STYLES, VOICES } from "@/lib/generator";

const COLD_OPEN = 0.35;

function speak(text: string, voiceId: string) {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const preset = VOICES.find((v) => v.id === voiceId);
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = preset?.pitch ?? 1;
    u.rate = preset?.rate ?? 1;
    synth.speak(u);
  } catch {
    /* silent fallback — captions carry the show */
  }
}

function hush() {
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* noop */
  }
}

interface Chunk {
  words: { w: string; start: number; end: number }[];
  start: number;
  end: number;
}

function chunkScene(scene: ScriptScene, size = 3): Chunk[] {
  const chunks: Chunk[] = [];
  for (let i = 0; i < scene.words.length; i += size) {
    const slice = scene.words.slice(i, i + size);
    chunks.push({ words: slice, start: slice[0].start, end: slice[slice.length - 1].end });
  }
  return chunks;
}

export default function PhonePlayer({
  short,
  mode = "full",
  autoPlay = false,
  startDelay = 0,
  loop = false,
  onForgeAnother,
  className = "",
}: {
  short: GeneratedShort;
  mode?: "full" | "mini";
  autoPlay?: boolean;
  startDelay?: number;
  loop?: boolean;
  onForgeAnother?: () => void;
  className?: string;
}) {
  const [t, setT] = useState(COLD_OPEN);
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [ended, setEnded] = useState(false);
  const [exporting, setExporting] = useState<"idle" | "working" | "done">("idle");
  const tRef = useRef(COLD_OPEN);

  const isMini = mode === "mini";
  const styleFilter = STYLES.find((s) => s.id === short.style)?.filter ?? "none";
  const voice = VOICES.find((v) => v.id === short.voice);

  /* reset when a new short drops in */
  useEffect(() => {
    tRef.current = COLD_OPEN;
    setT(COLD_OPEN);
    setEnded(false);
    setExporting("idle");
    setPlaying(autoPlay);
    return () => hush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [short]);

  useEffect(() => {
    if (!autoPlay) return;
    const id = setTimeout(() => setPlaying(true), startDelay);
    return () => clearTimeout(id);
  }, [autoPlay, startDelay]);

  /* master clock */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      tRef.current += dt;
      if (tRef.current >= short.duration) {
        if (loop) {
          tRef.current = COLD_OPEN;
          setT(COLD_OPEN);
        } else {
          tRef.current = short.duration;
          setT(short.duration);
          setPlaying(false);
          setEnded(true);
          hush();
          return;
        }
      } else {
        setT(tRef.current);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, short.duration]);

  const sceneIdx = useMemo(() => {
    let idx = 0;
    short.scenes.forEach((s, i) => {
      if (t >= s.start) idx = i;
    });
    return idx;
  }, [short, t]);

  const scene = short.scenes[sceneIdx];

  /* narration follows the scene */
  useEffect(() => {
    if (playing && soundOn && !isMini) speak(scene.text, short.voice);
    if (!playing || !soundOn) hush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIdx, playing, soundOn, short]);

  const chunks = useMemo(() => chunkScene(scene, isMini ? 2 : 3), [scene, isMini]);
  const chunkIdx = useMemo(() => {
    let idx = 0;
    chunks.forEach((c, i) => {
      if (t >= c.start) idx = i;
    });
    return idx;
  }, [chunks, t]);
  const chunk = chunks[chunkIdx];

  const togglePlay = () => {
    if (ended) {
      replay();
      return;
    }
    setPlaying((p) => !p);
  };

  const replay = () => {
    tRef.current = COLD_OPEN;
    setT(COLD_OPEN);
    setEnded(false);
    setExporting("idle");
    setPlaying(true);
  };

  const fakeExport = () => {
    if (exporting !== "idle") return;
    setExporting("working");
    setTimeout(() => setExporting("done"), 1600);
    setTimeout(() => setExporting("idle"), 4200);
  };

  const captionSize = isMini ? "text-[13px] leading-snug" : "text-[22px] leading-tight";

  return (
    <div
      className={`relative aspect-[9/19] w-full overflow-hidden rounded-[2.4rem] border border-white/12 bg-black shadow-[0_40px_120px_-20px_rgba(124,108,255,0.35)] ${className}`}
    >
      {/* scene image */}
      <div key={sceneIdx} className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={scene.img}
          alt=""
          className={`kb ${scene.kb} h-full w-full object-cover`}
          style={{ filter: styleFilter }}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/75" />

      {/* notch */}
      <div className="absolute left-1/2 top-2.5 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black/90" />

      {/* progress segments */}
      <div className="absolute inset-x-3 top-10 z-20 flex gap-1">
        {short.scenes.map((s, i) => {
          const p = Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start)));
          return (
            <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-cream" style={{ width: `${p * 100}%` }} />
            </div>
          );
        })}
      </div>

      {/* beat + voice row */}
      <div className="absolute inset-x-3 top-[52px] z-20 flex items-center justify-between">
        <span className="rounded-full bg-black/45 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-lime backdrop-blur-sm">
          {scene.beat}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm">
          <span className={`eq text-lime ${playing ? "" : "paused"}`} style={{ height: 10 }}>
            <span /><span /><span /><span />
          </span>
          {voice?.name ?? "AI"}
        </span>
      </div>

      {/* captions */}
      <div className="absolute inset-x-0 bottom-[18%] z-20 flex justify-center px-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={`${sceneIdx}-${chunkIdx}`}
            initial={{ opacity: 0, y: 14, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.14 }}
            className={`text-center font-display font-bold uppercase tracking-tight ${captionSize}`}
            style={{ textShadow: "0 2px 18px rgba(0,0,0,0.8)" }}
          >
            {chunk.words.map((word, i) => {
              const live = t >= word.start && t <= word.end;
              const said = t > word.end;
              return (
                <span
                  key={i}
                  className={`cap-word inline-block ${live ? "live" : said ? "text-cream" : "text-white/45"}`}
                >
                  {word.w}
                  {i < chunk.words.length - 1 ? "\u00A0" : ""}
                </span>
              );
            })}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* bottom control bar (full mode) */}
      {!isMini && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="grid h-11 w-11 place-items-center rounded-full bg-lime text-void transition-transform hover:scale-105 active:scale-95"
            >
              {playing ? <Pause className="h-4.5 w-4.5 fill-current" /> : <Play className="ml-0.5 h-4.5 w-4.5 fill-current" />}
            </button>
            <button
              onClick={() => setSoundOn((s) => !s)}
              aria-label="Toggle narration"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              onClick={replay}
              aria-label="Replay"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-wider text-white/60">
              {t.toFixed(1)}s / {short.duration.toFixed(1)}s
            </span>
            <button
              onClick={fakeExport}
              className="flex items-center gap-1.5 rounded-full bg-cream px-3.5 py-2 text-[11px] font-bold text-void transition hover:bg-white"
            >
              {exporting === "working" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : exporting === "done" ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {exporting === "done" ? "Saved" : "Export"}
            </button>
          </div>
        </div>
      )}

      {/* end card */}
      <AnimatePresence>
        {ended && !isMini && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-void/90 px-6 text-center backdrop-blur-md"
          >
            <div className="relative grid h-24 w-24 place-items-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="#D9FF4D"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 44}
                  initial={{ strokeDashoffset: 2 * Math.PI * 44 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - short.score / 100) }}
                  transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                />
              </svg>
              <span className="font-display text-2xl font-bold">{short.score}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-lime">
              <Flame className="h-3.5 w-3.5" /> Virality score
            </div>
            <p className="font-display text-lg font-bold leading-tight">{short.title}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={replay}
                className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/5"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Replay
              </button>
              {onForgeAnother && (
                <button
                  onClick={onForgeAnother}
                  className="rounded-full bg-lime px-4 py-2 text-xs font-bold text-void transition hover:brightness-110"
                >
                  Forge another
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
