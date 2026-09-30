"use client";

import Link from "next/link";
import { useStudio } from "@/components/studio/StudioContext";
import { SetupGuide, YouTubeCard } from "@/components/studio/panels";
import { useAgent } from "./data";
import { NavIcon, Panel, StatusPill } from "./ui";

export default function YouTubePage() {
  const { yt, setYt, say } = useStudio();
  const { overview } = useAgent();
  const published = (overview?.recent ?? []).filter((v) => v.youtubeVideoId);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight"><NavIcon name="youtube" className="h-5 w-5 text-red-400" /> YouTube</h1>
      <YouTubeCard yt={yt} onChange={setYt} say={say} />
      {!yt.connected && <SetupGuide />}
      <Panel>
        <h2 className="mb-3 font-display text-sm font-bold">Recently published by the agent</h2>
        {published.length === 0 ? <p className="text-sm text-dim">Nothing published yet. Approve a video in My Videos, then publish it.</p> : (
          <ul className="space-y-2">{published.map((v) => (
            <li key={v.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] px-3 py-2 text-sm">
              <Link href={`/studio/videos/${v.id}`} className="min-w-0 flex-1 truncate font-semibold">{v.title}</Link>
              <StatusPill workflow={v.workflow} />
              <a href={`https://youtu.be/${v.youtubeVideoId}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-red-400">Open</a>
            </li>
          ))}</ul>
        )}
      </Panel>
    </div>
  );
}
