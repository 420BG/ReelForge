"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckSquare, Loader2, Sparkles, Trash2, X } from "lucide-react";
import type { AgentVideo, Workflow } from "@/content/types";
import { api, useAgent } from "./data";
import { Button, Empty, VideoCard } from "./ui";

const FILTERS: { id: "all" | Workflow; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "processing", label: "Rendering" },
  { id: "review", label: "Ready" },
  { id: "approved", label: "Approved" },
  { id: "published", label: "Published" },
  { id: "failed", label: "Failed" },
];

export default function Library() {
  const { overview, notify, refresh } = useAgent();
  const [filter, setFilter] = useState<"all" | Workflow>("all");
  const [videos, setVideos] = useState<AgentVideo[] | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try { setVideos((await api<{ videos: AgentVideo[] }>(`/api/agent/videos?workflow=${filter}`)).videos); }
    catch { setVideos([]); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);
  const running = (overview?.jobs.length ?? 0) > 0;
  useEffect(() => {
    const id = window.setInterval(() => { void load(); }, running ? 6000 : 30000);
    return () => window.clearInterval(id);
  }, [load, running]);

  async function remove(ids: string[], label: string) {
    if (!ids.length) return;
    if (!window.confirm(`Delete ${label}? This removes the video${ids.length > 1 ? "s" : ""} and all generated files. It can't be undone.`)) return;
    setDeleting(true);
    let failed = 0;
    for (const id of ids) {
      try { await api(`/api/agent/videos/${id}`, { method: "DELETE" }); } catch { failed++; }
    }
    setDeleting(false);
    setSelected(new Set());
    setSelectMode(false);
    notify(failed ? `Deleted ${ids.length - failed}, ${failed} failed.` : `Deleted ${ids.length} video${ids.length > 1 ? "s" : ""}.`, failed ? "error" : "ok");
    void load();
    void refresh();
  }
  const toggle = (video: AgentVideo) => setSelected((prev) => { const next = new Set(prev); if (next.has(video.id)) next.delete(video.id); else next.add(video.id); return next; });

  const count = (id: "all" | Workflow) => (id === "all" ? overview?.counts.total : overview?.counts[id]) ?? 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">My Videos</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }} className="h-10 text-xs">{selectMode ? <><X className="h-3.5 w-3.5" /> Done</> : <><CheckSquare className="h-3.5 w-3.5" /> Select</>}</Button>
          <Button href="/studio/create" className="h-10 text-xs"><Sparkles className="h-3.5 w-3.5" /> New video</Button>
        </div>
      </div>
      {selectMode && videos && (
        <div className="sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-void/90 p-2.5 backdrop-blur">
          <span className="px-1 text-xs font-semibold text-mute">{selected.size} selected</span>
          <Button variant="ghost" onClick={() => setSelected(new Set(videos.map((v) => v.id)))} className="h-9 text-xs">Select all ({videos.length})</Button>
          <Button variant="danger" busy={deleting} disabled={!selected.size} onClick={() => void remove([...selected], `${selected.size} video${selected.size > 1 ? "s" : ""}`)} className="ml-auto h-9 text-xs"><Trash2 className="h-3.5 w-3.5" /> Delete selected</Button>
        </div>
      )}
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${filter === f.id ? "border-lime/60 bg-lime/[0.1] text-lime" : "border-white/10 text-mute hover:text-cream"}`}>
            {f.label} ({count(f.id)})
          </button>
        ))}
      </div>
      {videos === null ? <div className="flex justify-center py-16 text-dim"><Loader2 className="h-5 w-5 animate-spin" /></div>
        : videos.length === 0 ? <Empty>No videos here yet.</Empty>
        : <>
            {(filter === "draft" || filter === "failed") && !selectMode && (
              <div className="mb-3 flex justify-end"><Button variant="danger" busy={deleting} onClick={() => void remove(videos.map((v) => v.id), `all ${videos.length} ${filter === "draft" ? "draft" : "failed"} video${videos.length > 1 ? "s" : ""}`)} className="h-9 text-xs"><Trash2 className="h-3.5 w-3.5" /> Delete all {filter === "draft" ? "drafts" : "failed"}</Button></div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{videos.map((video) => (
              <VideoCard key={video.id} video={video} selectMode={selectMode} selected={selected.has(video.id)} onSelect={toggle} onDelete={(v) => void remove([v.id], `“${v.title || "this video"}”`)} />
            ))}</div>
          </>}
    </div>
  );
}
