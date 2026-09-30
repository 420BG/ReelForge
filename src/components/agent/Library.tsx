"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
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
  const { overview } = useAgent();
  const [filter, setFilter] = useState<"all" | Workflow>("all");
  const [videos, setVideos] = useState<AgentVideo[] | null>(null);

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

  const count = (id: "all" | Workflow) => (id === "all" ? overview?.counts.total : overview?.counts[id]) ?? 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">My Videos</h1>
        <Button href="/studio/create" className="h-10 text-xs"><Sparkles className="h-3.5 w-3.5" /> New video</Button>
      </div>
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
        : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{videos.map((video) => <VideoCard key={video.id} video={video} />)}</div>}
    </div>
  );
}
