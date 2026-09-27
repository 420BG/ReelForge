"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  RotateCcw,
  Trash2,
  Download,
  X,
  Flame,
  Film,
  KeyRound,
  ExternalLink,
  Unplug,
  Link2,
  Wifi,
  WifiOff,
  AlertTriangle,
  BookOpen,
  CircleCheck,
  Upload,
} from "lucide-react";
import { YouTubeIcon } from "@/components/ui";
import { isPending, timeAgo, type VideoItem, type ProviderItem, type YtStatus } from "./StudioApp";
import type { ProviderKind } from "@/lib/providers";

/* ── status pill ─────────────────────────────────────────────── */
const STATUS_META: Record<string, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-white/[0.07] text-mute" },
  script: { label: "Writing script", cls: "bg-violet/20 text-violet-soft" },
  media: { label: "Forging media", cls: "bg-violet/20 text-violet-soft" },
  render: { label: "Rendering", cls: "bg-violet/20 text-violet-soft" },
  upload: { label: "Uploading", cls: "bg-lime/15 text-lime" },
  rendered: { label: "Rendered", cls: "bg-lime/15 text-lime" },
  posted: { label: "On YouTube", cls: "bg-lime text-void" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-400" },
};

function PublishModal({
  v,
  onClose,
  onDone,
}: {
  v: VideoItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(v.script?.title ?? v.title);
  const [description, setDescription] = useState(v.script?.description ?? "");
  const [tags, setTags] = useState((v.script?.tags ?? []).join(", "));
  const [privacy, setPrivacy] = useState(v.privacy || "private");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/videos/${v.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          privacy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "publish failed");
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "publish failed");
    } finally {
      setBusy(false);
    }
  };

  const fieldCls =
    "w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-sm text-cream outline-none transition placeholder:text-dim focus:border-lime/50";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[130] grid place-items-center bg-void/85 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        className="glass-deep w-full max-w-md rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <Upload className="h-4 w-4 text-lime" /> Publish to YouTube
          </h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-mute hover:text-cream">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Title" className={fieldCls} />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Description"
            className={`${fieldCls} resize-none`}
          />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma, separated" className={fieldCls} />
          <div className="flex gap-1.5">
            {(["private", "unlisted", "public"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPrivacy(p)}
                className={`flex-1 rounded-xl border py-2 text-xs font-semibold capitalize transition ${
                  privacy === p ? "border-lime/60 bg-lime/[0.08] text-cream" : "border-white/10 text-mute hover:text-cream"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}

        <button
          onClick={submit}
          disabled={busy || !title.trim()}
          className="btn-sheen mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime text-sm font-bold text-void transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Upload className="h-4.5 w-4.5" />}
          {busy ? "Publishing…" : "Publish"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function VideoCard({
  v,
  onAction,
  onWatch,
  onPublish,
}: {
  v: VideoItem;
  onAction: (id: string, a: "retry" | "delete") => void;
  onWatch: (v: VideoItem) => void;
  onPublish: (v: VideoItem) => void;
}) {
  const meta = STATUS_META[v.status] ?? STATUS_META.queued;
  const playing = isPending(v.status);
  const ready = v.status === "rendered" || v.status === "posted";
  const canPublish = v.status === "rendered" && !v.youtubeId;

  return (
    <div className="glass group flex flex-col overflow-hidden rounded-2xl transition-colors hover:border-violet/40">
      <button
        onClick={() => ready && onWatch(v)}
        className="relative block aspect-video w-full overflow-hidden bg-ink text-left"
      >
        {v.thumbRel ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/videos/${v.id}/file?thumb=1`} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center">
            {playing ? <Loader2 className="h-6 w-6 animate-spin text-violet-soft" /> : <Film className="h-6 w-6 text-dim" />}
          </div>
        )}
        <span className={`absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.cls}`}>
          {playing && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          {meta.label}
        </span>
        <span className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white/70">
          {v.format}
        </span>
        {v.durationSec && (
          <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2 py-1 text-[9px] font-bold text-white/70">
            {Math.floor(v.durationSec / 60)}:{String(v.durationSec % 60).padStart(2, "0")}
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 text-sm font-bold leading-snug">{v.title}</p>
        <p className="mt-1 text-[11px] text-dim">
          {timeAgo(v.createdAt)} · {v.niche} · {v.voice}
        </p>

        {Object.values(v.providers ?? {}).some(Boolean) && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {Object.entries(v.providers).filter(([, val]) => Boolean(val)).map(([k, val]) => (
              <span key={k} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-dim">
                {k}:{val}
              </span>
            ))}
          </div>
        )}

        {v.status === "failed" && (
          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-red-400/90">{v.error}</p>
        )}

        <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.06] pt-3">
          {v.youtubeId && (
            <a
              href={`https://youtu.be/${v.youtubeId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-[10px] font-bold text-red-300 transition hover:bg-red-500/25"
            >
              <YouTubeIcon className="h-3.5 w-3.5" /> Watch on YouTube
            </a>
          )}
          {canPublish && (
            <button
              onClick={() => onPublish(v)}
              className="flex items-center gap-1.5 rounded-lg bg-lime/15 px-2.5 py-1.5 text-[10px] font-bold text-lime transition hover:bg-lime/25"
            >
              <Upload className="h-3.5 w-3.5" /> Publish
            </button>
          )}
          <div className="flex-1" />
          {ready && (
            <a
              href={`/api/videos/${v.id}/file`}
              download
              className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-mute transition hover:border-lime/40 hover:text-lime"
              title="Download mp4"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          {v.status === "failed" && (
            <button onClick={() => onAction(v.id, "retry")} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-mute transition hover:border-lime/40 hover:text-lime" title="Retry">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => onAction(v.id, "delete")} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-mute transition hover:border-red-400/40 hover:text-red-400" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTERS: { id: string; label: string; test: (s: string) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "queued", label: "Queued", test: (s) => s === "queued" },
  { id: "rendering", label: "Rendering", test: (s) => ["script", "media", "render", "upload"].includes(s) },
  { id: "ready", label: "Ready", test: (s) => s === "rendered" },
  { id: "posted", label: "Published", test: (s) => s === "posted" },
  { id: "failed", label: "Failed", test: (s) => s === "failed" },
];

export function VideoQueue({
  videos,
  onAction,
  onChanged,
}: {
  videos: VideoItem[];
  onAction: (id: string, a: "retry" | "delete") => void;
  onChanged: () => void;
}) {
  const [watching, setWatching] = useState<VideoItem | null>(null);
  const [publishing, setPublishing] = useState<VideoItem | null>(null);
  const [filter, setFilter] = useState("all");

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const shown = videos.filter((v) => active.test(v.status));

  return (
    <section className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Film className="h-4.5 w-4.5 text-lime" /> Video queue
        </h2>
        <span className="text-xs text-dim">{videos.length} forged</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = videos.filter((v) => f.test(v.status)).length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                filter === f.id ? "border-lime/60 bg-lime/[0.08] text-cream" : "border-white/10 bg-white/[0.02] text-mute hover:text-cream"
              }`}
            >
              {f.label} {count > 0 && <span className="text-dim">· {count}</span>}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="glass rounded-2xl px-6 py-14 text-center">
          <Flame className="mx-auto h-6 w-6 text-dim" />
          <p className="mt-3 text-sm text-mute">
            {videos.length === 0 ? "The queue is cold. Forge your first video above." : `Nothing in “${active.label}” yet.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((v) => (
            <VideoCard key={v.id} v={v} onAction={onAction} onWatch={setWatching} onPublish={setPublishing} />
          ))}
        </div>
      )}

      {/* watch modal */}
      <AnimatePresence>
        {watching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] grid place-items-center bg-void/85 p-4 backdrop-blur-md"
            onClick={() => setWatching(null)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              className={`w-full ${watching.format === "short" ? "max-w-[340px]" : "max-w-3xl"}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="truncate font-display text-sm font-bold">{watching.title}</p>
                <button onClick={() => setWatching(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-mute hover:text-cream">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <video
                src={`/api/videos/${watching.id}/file`}
                controls
                autoPlay
                loop
                className={`w-full rounded-2xl border border-white/10 bg-black ${watching.format === "short" ? "aspect-[9/16]" : "aspect-video"}`}
              />
              {watching.script?.description && (
                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-mute">{watching.script.description}</p>
              )}
              {Object.keys(watching.providers ?? {}).length > 0 && (
                <p className="mt-2.5 text-center font-mono text-[10px] text-dim">
                  {Object.entries(watching.providers).map(([k, v]) => `${k}→${v}`).join("  ·  ")}
                </p>
              )}
              {watching.status === "rendered" && !watching.youtubeId && (
                <button
                  onClick={() => {
                    setPublishing(watching);
                    setWatching(null);
                  }}
                  className="btn-sheen mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-lime text-sm font-bold text-void transition hover:brightness-110"
                >
                  <Upload className="h-4 w-4" /> Publish to YouTube
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* publish modal */}
      <AnimatePresence>
        {publishing && (
          <PublishModal
            v={publishing}
            onClose={() => setPublishing(null)}
            onDone={onChanged}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

/* ── provider rotation board ─────────────────────────────────── */
const KIND_LABEL: Record<ProviderKind, string> = {
  script: "Script brains",
  image: "Scene imagery",
  voice: "Narration voices",
  upload: "Publishing",
};

export function ProvidersPanel({ providers }: { providers: ProviderItem[] }) {
  const kinds: ProviderKind[] = ["script", "image", "voice", "upload"];
  return (
    <section className="glass-deep rounded-3xl p-6 sm:p-7">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Wifi className="h-4.5 w-4.5 text-lime" /> Free-AI rotation
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-mute">
        Every job walks its chain top → bottom. When a provider hits its daily free limit, it&rsquo;s
        flagged exhausted and the next one takes over — quotas reset at midnight and the chain heals itself.
      </p>

      <div className="mt-5 space-y-5">
        {kinds.map((kind) => (
          <div key={kind}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-dim">
              {KIND_LABEL[kind]}
            </p>
            <div className="space-y-1.5">
              {providers.filter((p) => p.kind === kind).map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
                  <span className="w-4 shrink-0 font-mono text-[10px] text-dim">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{p.name}</p>
                    <p className="truncate text-[10px] text-dim">
                      {p.freeLimit} · resets {p.resets}
                    </p>
                  </div>
                  {p.callsToday > 0 && (
                    <span className="hidden font-mono text-[9px] text-dim sm:block">{p.callsToday}×</span>
                  )}
                  {p.exhausted ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[9px] font-bold text-red-400">
                      <WifiOff className="h-2.5 w-2.5" /> Exhausted
                    </span>
                  ) : p.configured ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-lime/15 px-2.5 py-1 text-[9px] font-bold text-lime">
                      <CircleCheck className="h-2.5 w-2.5" /> Ready
                    </span>
                  ) : (
                    <a
                      href={p.getKeyUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[9px] font-bold text-amber-300 transition hover:bg-amber-400/25"
                    >
                      <KeyRound className="h-2.5 w-2.5" /> Free key <ExternalLink className="h-2 w-2" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── youtube card ────────────────────────────────────────────── */
export function YouTubeCard({ yt, onChange, say }: { yt: YtStatus; onChange: (s: YtStatus) => void; say: (m: string) => void }) {
  const disconnect = async () => {
    await fetch("/api/youtube/disconnect", { method: "POST" });
    onChange({ ...yt, connected: false, channelTitle: null, channelId: null });
    say("YouTube disconnected.");
  };

  return (
    <section className="glass-deep rounded-3xl p-6 sm:p-7">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <YouTubeIcon className="h-5 w-5 text-red-400" /> YouTube
      </h2>

      {!yt.configured && (
        <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> OAuth keys not in environment
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-mute">
            Add <span className="font-mono text-cream">GOOGLE_CLIENT_ID</span> and{" "}
            <span className="font-mono text-cream">GOOGLE_CLIENT_SECRET</span> (plus{" "}
            <span className="font-mono text-cream">APP_URL</span>) then restart. Follow the setup
            guide below — it takes ~5 minutes and is free.
          </p>
        </div>
      )}

      {yt.configured && !yt.connected && (
        <a
          href="/api/youtube/auth"
          className="btn-sheen mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-500 text-sm font-bold text-white transition hover:brightness-110"
        >
          <Link2 className="h-4 w-4" /> Connect your channel
        </a>
      )}

      {yt.connected && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-lime/25 bg-lime/[0.05] px-4 py-3.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-red-500/20 text-red-300">
              <YouTubeIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{yt.channelTitle ?? "Channel linked"}</p>
              <p className="text-[10px] text-dim">Uploads post as the privacy you pick per video</p>
            </div>
            <button onClick={disconnect} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-mute transition hover:border-red-400/40 hover:text-red-400" title="Disconnect">
              <Unplug className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-dim">
            Free quota: 10,000 units/day — each upload costs 1,600 (~6 videos/day). If quota runs out
            mid-upload, the video stays rendered in the queue and can be retried tomorrow.
          </p>
        </div>
      )}
    </section>
  );
}

/* ── setup guide ─────────────────────────────────────────────── */
const GUIDE = [
  {
    t: "Grab free script keys (optional but smart)",
    d: "Groq (console.groq.com/keys) and Gemini (aistudio.google.com/apikey) are free with no card. Drop them in env as GROQ_API_KEY / GEMINI_API_KEY. Without them the built-in forge engine writes everything — it never runs out.",
  },
  {
    t: "Enable the YouTube Data API",
    d: "In Google Cloud Console: create a project → APIs & Services → enable 'YouTube Data API v3' → OAuth consent screen (External, add yourself as a test user).",
  },
  {
    t: "Create OAuth credentials",
    d: "Credentials → Create OAuth client ID (Web). Add authorized redirect URI: APP_URL + /api/youtube/callback. Put the pair in env as GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, set APP_URL to this site's URL, restart, then hit Connect.",
  },
  {
    t: "Arm a series and walk away",
    d: "Autopilot checks every 60s. Shorts fire daily, long videos weekly. An external cron (cron-job.org, free) can also ping /api/cron with header x-cron-secret = CRON_SECRET for redundancy.",
  },
];

export function SetupGuide() {
  return (
    <section className="glass-deep rounded-3xl p-6 sm:p-7">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <BookOpen className="h-4.5 w-4.5 text-lime" /> Setup guide
      </h2>
      <ol className="mt-4 space-y-4">
        {GUIDE.map((g, i) => (
          <li key={g.t} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-lime/40 font-mono text-[10px] font-bold text-lime">
              {i + 1}
            </span>
            <div>
              <p className="text-[13px] font-bold leading-snug">{g.t}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-mute">{g.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
