"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Zap,
  Loader2,
  Dices,
  Power,
  Trash2,
  Play,
  LogOut,
  Layers,
  Timer,
  CheckCircle2,
} from "lucide-react";
import { NICHES, VOICES, STYLES } from "@/lib/generator";
import { Logo } from "@/components/ui";
import { VideoQueue, ProvidersPanel, YouTubeCard, SetupGuide } from "./panels";

export interface SeriesItem {
  id: string;
  name: string;
  niche: string;
  voice: string;
  style: string;
  format: string;
  frequency: string;
  privacy: string;
  autopilot: number;
  autoUpload: number;
  nextRunAt: string;
  createdAt: string;
}

export interface VideoItem {
  id: string;
  seriesId: string | null;
  topic: string;
  title: string;
  niche: string;
  voice: string;
  style: string;
  format: string;
  privacy: string;
  autoUpload: number;
  status: string;
  error: string | null;
  durationSec: number | null;
  videoRel: string | null;
  thumbRel: string | null;
  providers: Record<string, string>;
  youtubeId: string | null;
  createdAt: string;
  postedAt: string | null;
}

export interface ProviderItem {
  id: string;
  kind: string;
  name: string;
  freeLimit: string;
  resets: string;
  getKeyUrl: string | null;
  note: string;
  configured: boolean;
  callsToday: number;
  failuresToday: number;
  exhausted: boolean;
}

export interface YtStatus {
  configured: boolean;
  connected: boolean;
  channelTitle: string | null;
  channelId: string | null;
}

const PENDING = new Set(["queued", "script", "media", "render", "upload"]);
export const isPending = (s: string) => PENDING.has(s);

export function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "due now";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 48) return `in ${Math.floor(h / 24)}d`;
  if (h >= 1) return `in ${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `in ${Math.max(1, Math.floor(ms / 60_000))}m`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const inputCls =
  "h-12 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm text-cream outline-none transition placeholder:text-dim focus:border-lime/50";
const chipCls = (on: boolean) =>
  `rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
    on ? "border-lime/60 bg-lime/[0.08] text-cream" : "border-white/10 bg-white/[0.02] text-mute hover:text-cream"
  }`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-dim">{label}</p>
      {children}
    </div>
  );
}

export default function StudioApp() {
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [yt, setYt] = useState<YtStatus>({ configured: false, connected: false, channelTitle: null, channelId: null });
  const [toast, setToast] = useState<string | null>(null);

  // one-off form
  const [topic, setTopic] = useState("black holes");
  const [niche, setNiche] = useState("space");
  const [voice, setVoice] = useState("atlas");
  const [style, setStyle] = useState("cinematic");
  const [format, setFormat] = useState<"short" | "long">("short");
  const [autoUpload, setAutoUpload] = useState(true);
  const [privacy, setPrivacy] = useState("private");
  const [forging, setForging] = useState(false);

  // series form
  const [sName, setSName] = useState("Cosmic Daily");
  const [sNiche, setSNiche] = useState("space");
  const [sFormat, setSFormat] = useState<"short" | "long">("short");
  const [sFreq, setSFreq] = useState("daily");
  const [sAutopilot, setSAutopilot] = useState(true);
  const [sUpload, setSUpload] = useState(true);

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3600);
  };

  const loadVideos = useCallback(() => {
    fetch("/api/videos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setVideos(d.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/series").then((r) => r.json()).then((d) => setSeries(d.items)).catch(() => {});
    fetch("/api/providers").then((r) => r.json()).then((d) => setProviders(d.items)).catch(() => {});
    fetch("/api/youtube/status").then((r) => r.json()).then(setYt).catch(() => {});
    loadVideos();
    const flag = new URLSearchParams(window.location.search).get("yt");
    if (flag === "connected") say("YouTube connected — uploads are armed.");
    if (flag === "error") say("YouTube connection failed.");
    if (flag === "unconfigured") say("Add GOOGLE_CLIENT_ID / SECRET to env first.");
  }, [loadVideos]);

  useEffect(() => {
    const id = setInterval(loadVideos, 6000);
    return () => clearInterval(id);
  }, [loadVideos]);

  const randomTopic = () => {
    const bank = NICHES.find((n) => n.id === niche)!.topics;
    setTopic(bank[Math.floor(Math.random() * bank.length)]);
  };

  const forgeNow = async () => {
    if (forging || !topic.trim()) return;
    setForging(true);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, niche, voice, style, format, autoUpload: autoUpload && yt.connected, privacy }),
      });
      if (!res.ok) throw new Error();
      say("Forging started — watch the queue.");
      setTimeout(loadVideos, 800);
    } catch {
      say("Failed to queue the video.");
    } finally {
      setForging(false);
    }
  };

  const createSeries = async () => {
    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: sName, niche: sNiche, format: sFormat, frequency: sFreq,
        autopilot: sAutopilot, autoUpload: sUpload && yt.connected, privacy, voice, style,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setSeries((s) => [d.series, ...s]);
      say(`Series "${sName}" armed.`);
    }
  };

  const patchSeries = async (id: string, patch: Record<string, unknown>) => {
    setSeries((list) => list.map((s) => (s.id === id ? { ...s, ...patch, autopilot: patch.autopilot !== undefined ? (patch.autopilot ? 1 : 0) : s.autopilot, autoUpload: patch.autoUpload !== undefined ? (patch.autoUpload ? 1 : 0) : s.autoUpload } : s)));
    await fetch(`/api/series/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const runSeries = async (id: string) => {
    await fetch(`/api/series/${id}/run`, { method: "POST" });
    say("Series fired — video queued.");
    setTimeout(loadVideos, 800);
  };

  const deleteSeries = async (id: string) => {
    setSeries((list) => list.filter((s) => s.id !== id));
    await fetch(`/api/series/${id}`, { method: "DELETE" });
  };

  const actionVideo = async (id: string, action: "retry" | "delete") => {
    if (action === "delete") {
      setVideos((v) => v.filter((x) => x.id !== id));
      await fetch(`/api/videos/${id}`, { method: "DELETE" });
    } else {
      await fetch(`/api/videos/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      setTimeout(loadVideos, 800);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const pendingCount = videos.filter((v) => isPending(v.status)).length;

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid fixed inset-0 -z-10 [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,black,transparent)]" />
      <div className="aurora-a fixed -top-40 left-[-10%] -z-10 h-[480px] w-[480px] rounded-full bg-violet/20 blur-[150px]" />

      {/* header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-void/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/"><Logo /></Link>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-mute sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${yt.connected ? "bg-lime" : "bg-red-400"}`} />
              {yt.connected ? yt.channelTitle ?? "YouTube linked" : "YouTube offline"}
            </span>
            {pendingCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-violet/15 px-3 py-1.5 text-[11px] font-bold text-violet-soft">
                <Loader2 className="h-3 w-3 animate-spin" /> {pendingCount} forging
              </span>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-[11px] font-semibold text-mute transition hover:text-cream"
            >
              <LogOut className="h-3.5 w-3.5" /> Lock
            </button>
          </div>
        </div>
      </header>

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-deep fixed left-1/2 top-20 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold"
          >
            <CheckCircle2 className="h-4 w-4 text-lime" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Autopilot <em className="font-serif italic font-normal text-lime">studio</em>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-mute">
              Your private content machine. Shorts forged daily, long videos weekly, uploaded straight to YouTube — powered by a rotation of free AI providers.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* forge one video */}
          <section className="glass-deep rounded-3xl p-6 sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <Zap className="h-4.5 w-4.5 text-lime" /> Forge one now
              </h2>
              <div className="flex gap-1.5">
                {(["short", "long"] as const).map((f) => (
                  <button key={f} onClick={() => setFormat(f)} className={chipCls(format === f)}>
                    {f === "short" ? "Short · 9:16" : "Long · 16:9"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Topic">
                <div className="flex gap-2">
                  <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} className={`${inputCls} flex-1`} placeholder="e.g. the Fermi paradox" />
                  <button onClick={randomTopic} aria-label="Random" className="grid h-12 w-12 place-items-center rounded-xl border border-white/12 text-mute transition hover:border-lime/40 hover:text-lime">
                    <Dices className="h-4.5 w-4.5" />
                  </button>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Niche">
                  <select value={niche} onChange={(e) => setNiche(e.target.value)} className={`${inputCls} w-full appearance-none`}>
                    {NICHES.map((n) => <option key={n.id} value={n.id} className="bg-ink">{n.label}</option>)}
                    <option value="custom" className="bg-ink">Custom / anything</option>
                  </select>
                </Field>
                <Field label="Narrator">
                  <select value={voice} onChange={(e) => setVoice(e.target.value)} className={`${inputCls} w-full appearance-none`}>
                    {VOICES.map((v) => <option key={v.id} value={v.id} className="bg-ink">{v.name} — {v.vibe}</option>)}
                  </select>
                </Field>
                <Field label="Style">
                  <select value={style} onChange={(e) => setStyle(e.target.value)} className={`${inputCls} w-full appearance-none`}>
                    {STYLES.map((s) => <option key={s.id} value={s.id} className="bg-ink">{s.label}</option>)}
                  </select>
                </Field>
                <Field label="YouTube privacy">
                  <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className={`${inputCls} w-full appearance-none`}>
                    <option value="private" className="bg-ink">Private</option>
                    <option value="unlisted" className="bg-ink">Unlisted</option>
                    <option value="public" className="bg-ink">Public</option>
                  </select>
                </Field>
              </div>

              <label className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition ${yt.connected ? "border-white/12" : "border-white/[0.06] opacity-50"}`}>
                <span className="text-sm font-semibold">Upload to YouTube when done</span>
                <button
                  type="button"
                  disabled={!yt.connected}
                  onClick={(e) => { e.preventDefault(); setAutoUpload((v) => !v); }}
                  className={`relative h-6 w-11 rounded-full p-0.5 transition ${autoUpload && yt.connected ? "bg-lime" : "bg-white/10"}`}
                >
                  <span className={`block h-5 w-5 rounded-full bg-void transition-transform ${autoUpload && yt.connected ? "translate-x-5" : ""}`} />
                </button>
              </label>

              <button
                onClick={forgeNow}
                disabled={forging || !topic.trim()}
                className="btn-sheen flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime text-sm font-bold text-void transition hover:brightness-110 disabled:opacity-50"
              >
                {forging ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Zap className="h-4.5 w-4.5 fill-current" />}
                {forging ? "Queueing…" : `Forge & ${autoUpload && yt.connected ? "upload" : "render"}`}
              </button>
            </div>
          </section>

          {/* autopilot series */}
          <section className="glass-deep rounded-3xl p-6 sm:p-7">
            <h2 className="mb-5 flex items-center gap-2 font-display text-lg font-bold">
              <Layers className="h-4.5 w-4.5 text-lime" /> Autopilot series
            </h2>

            <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-void/50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <input value={sName} onChange={(e) => setSName(e.target.value)} maxLength={60} className={`${inputCls} col-span-2 w-full`} placeholder="Series name" />
                <select value={sNiche} onChange={(e) => setSNiche(e.target.value)} className={`${inputCls} w-full appearance-none`}>
                  {NICHES.map((n) => <option key={n.id} value={n.id} className="bg-ink">{n.label}</option>)}
                </select>
                <select value={sFreq} onChange={(e) => setSFreq(e.target.value)} className={`${inputCls} w-full appearance-none`}>
                  <option value="daily" className="bg-ink">Every day</option>
                  <option value="weekly" className="bg-ink">Every week</option>
                </select>
                <select value={sFormat} onChange={(e) => setSFormat(e.target.value as "short" | "long")} className={`${inputCls} w-full appearance-none`}>
                  <option value="short" className="bg-ink">Short (9:16)</option>
                  <option value="long" className="bg-ink">Long video (16:9)</option>
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSAutopilot((v) => !v)} className={chipCls(sAutopilot)}>Autopilot {sAutopilot ? "on" : "off"}</button>
                  <button onClick={() => yt.connected && setSUpload((v) => !v)} className={chipCls(sUpload && yt.connected)}>Auto-upload</button>
                </div>
              </div>
              <button onClick={createSeries} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-lime/40 text-sm font-bold text-lime transition hover:bg-lime/10">
                <Power className="h-4 w-4" /> Arm this series
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {series.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-dim">
                  No series yet. Arm one above and the forge will post on schedule forever.
                </p>
              )}
              {series.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: NICHES.find((n) => n.id === s.niche)?.hue ?? "#8B7CFF" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{s.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-dim">
                      <Timer className="h-3 w-3" />
                      {s.format} · {s.frequency} · next {timeUntil(s.nextRunAt)}
                      {s.autopilot === 1 ? "" : " · paused"}
                    </p>
                  </div>
                  <button
                    onClick={() => patchSeries(s.id, { autopilot: s.autopilot !== 1 })}
                    className={`grid h-8 w-8 place-items-center rounded-lg border transition ${s.autopilot === 1 ? "border-lime/40 text-lime" : "border-white/10 text-dim"}`}
                    title={s.autopilot === 1 ? "Pause" : "Resume"}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => runSeries(s.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-mute transition hover:border-lime/40 hover:text-lime" title="Run now">
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteSeries(s.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-mute transition hover:border-red-400/40 hover:text-red-400" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <VideoQueue videos={videos} onAction={actionVideo} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <ProvidersPanel providers={providers} />
          <div className="space-y-6">
            <YouTubeCard yt={yt} onChange={setYt} say={say} />
            <SetupGuide />
          </div>
        </div>
      </main>
    </div>
  );
}
