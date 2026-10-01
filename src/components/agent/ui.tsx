"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Film, Loader2, Trash2 } from "lucide-react";
import { aspectOf, type AgentVideo, type Workflow } from "@/content/types";
import { fileUrl, formatDuration } from "./data";

/* Small, dependency-free icons for the nav (keeps us on icons we know exist). */
const paths: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  create: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></>,
  chat: <path d="M4 5h16v11H8l-4 4z" />,
  autopilot: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4z" /></>,
  videos: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 4v5M16 4v5" /></>,
  youtube: <><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="m10 9 5 3-5 3z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
};

export function NavIcon({ name, className = "h-[18px] w-[18px]" }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? paths.home}
    </svg>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-lime text-void shadow-[0_0_24px_rgba(217,255,77,0.35)]">
        <NavIcon name="bolt" className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block font-display text-lg font-bold tracking-tight">Reel<span className="text-lime">Forge</span></span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">AI Video Creator</span>
        </span>
      )}
    </span>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass-deep rounded-3xl border border-white/[0.06] p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function PanelTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-sm font-bold tracking-tight">{icon}{children}</h2>
      {right}
    </div>
  );
}

export function Button({ children, onClick, href, variant = "primary", disabled, busy, className = "", type = "button" }: {
  children: ReactNode; onClick?: () => void; href?: string; variant?: "primary" | "ghost" | "outline" | "danger" | "good";
  disabled?: boolean; busy?: boolean; className?: string; type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-lime text-void hover:brightness-110 shadow-[0_0_24px_rgba(217,255,77,0.18)]",
    ghost: "text-mute hover:text-cream hover:bg-white/[0.04]",
    outline: "border border-white/12 text-cream hover:border-lime/40",
    danger: "border border-red-400/30 text-red-300 hover:bg-red-400/10",
    good: "bg-emerald-400/90 text-void hover:brightness-110",
  }[variant];
  const cls = `inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`;
  const inner = <>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{children}</>;
  if (href && (href.startsWith("/api/") || /^https?:\/\//.test(href))) {
    const external = /^https?:\/\//.test(href);
    return <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{inner}</a>;
  }
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled || busy} className={cls}>{inner}</button>;
}

export function Chip({ on, children, onClick, className = "" }: { on?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${on ? "border-lime/60 bg-lime/[0.1] text-lime" : "border-white/10 bg-white/[0.02] text-mute hover:text-cream"} ${className}`}>
      {children}
    </button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-lime" : "bg-white/[0.12]"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-void transition-all ${on ? "left-[22px]" : "left-0.5 bg-cream"}`} />
    </button>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div className="h-full rounded-full bg-lime transition-all duration-500" style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
    </div>
  );
}

const WORKFLOW: Record<Workflow, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-white/[0.08] text-mute" },
  processing: { label: "Rendering", cls: "bg-violet/20 text-violet-soft" },
  review: { label: "Ready", cls: "bg-lime/15 text-lime" },
  approved: { label: "Approved", cls: "bg-emerald-400/15 text-emerald-300" },
  published: { label: "Published", cls: "bg-lime/15 text-lime" },
  failed: { label: "Failed", cls: "bg-red-400/15 text-red-300" },
};
export const workflowLabel = (workflow: Workflow) => WORKFLOW[workflow].label;

export function StatusPill({ workflow }: { workflow: Workflow }) {
  const w = WORKFLOW[workflow];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${w.cls}`}>{workflow === "processing" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}{w.label}</span>;
}

export function ModeBadge({ video }: { video: Pick<AgentVideo, "renderMode"> }) {
  if (!video.renderMode) return null;
  if (video.renderMode === "video") return <span className="rounded-md bg-lime px-1.5 py-0.5 text-[9px] font-black tracking-wide text-void">AI VIDEO</span>;
  if (video.renderMode === "stock") return <span className="rounded-md bg-sky-300 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-void">STOCK VIDEO</span>;
  if (video.renderMode === "mixed") return <span className="rounded-md bg-violet-soft px-1.5 py-0.5 text-[9px] font-black tracking-wide text-void">AI IMAGES + VIDEO</span>;
  return <span className="rounded-md bg-amber-300 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-void">AI IMAGES</span>;
}

export function VideoCard({ video, compact = false, onDelete, selectMode = false, selected = false, onSelect }: {
  video: AgentVideo; compact?: boolean; onDelete?: (video: AgentVideo) => void; selectMode?: boolean; selected?: boolean; onSelect?: (video: AgentVideo) => void;
}) {
  const running = video.job && ["queued", "running", "waiting"].includes(video.job.state);
  const body = (
    <>
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-ink">
        {video.hasCover
          ? <img src={fileUrl(video.id, "cover", `&v=${encodeURIComponent(video.updatedAt)}`)} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          : <div className="grid h-full w-full place-items-center bg-gradient-to-b from-violet/20 to-void text-dim"><Film className="h-7 w-7" /></div>}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-10">
          <p className={`font-display font-bold leading-tight text-cream ${compact ? "text-[11px]" : "text-sm"} line-clamp-2`}>{video.title || "Writing story…"}</p>
          <p className="mt-0.5 text-[10px] text-mute">{video.settings.format === "long" ? "Long" : "Short"} · {aspectOf(video.settings)} · {formatDuration(video.durationSec ?? video.settings.targetDuration)}</p>
        </div>
        <div className="absolute left-2 top-2"><ModeBadge video={video} /></div>
        {selectMode && (
          <span className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 text-[11px] font-black ${selected ? "border-lime bg-lime text-void" : "border-white/70 bg-black/40 text-transparent"}`}>✓</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <StatusPill workflow={video.workflow} />
        {video.youtubeVideoId && <span className="text-[10px] font-bold text-red-400">YouTube</span>}
      </div>
      {running && video.job && <div className="px-2.5 pb-2.5"><Progress value={video.job.progress} /></div>}
    </>
  );
  const frame = `group relative block overflow-hidden rounded-2xl border bg-white/[0.02] transition ${selected ? "border-lime/70" : "border-white/[0.07] hover:border-lime/30"}`;
  return (
    <div className="relative">
      {selectMode
        ? <button type="button" onClick={() => onSelect?.(video)} className={`${frame} w-full text-left`}>{body}</button>
        : <Link href={`/studio/videos/${video.id}`} className={frame}>{body}</Link>}
      {onDelete && !selectMode && (
        <button type="button" aria-label="Delete video" onClick={() => onDelete(video)}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-red-300 backdrop-blur transition hover:bg-red-500/80 hover:text-white">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-dim">{children}</div>;
}
