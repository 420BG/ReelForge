"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Dices, Pause, Play, Send, Sparkles } from "lucide-react";
import { useStudio } from "@/components/studio/StudioContext";
import { timeUntil } from "@/components/studio/StudioApp";
import { greeting, useAgent } from "./data";
import { Button, Empty, NavIcon, Panel, PanelTitle, Progress, VideoCard } from "./ui";

export default function Home() {
  const router = useRouter();
  const { overview, error } = useAgent();
  const { series, autopilotActive, toggleAllAutopilot } = useStudio();

  const nextRun = useMemo(() => {
    const active = series.filter((s) => s.autopilot === 1);
    return active.length ? active.reduce((a, b) => (new Date(a.nextRunAt) < new Date(b.nextRunAt) ? a : b)) : null;
  }, [series]);

  const randomIdea = () => {
    const niches = (overview?.niches ?? []).filter((n) => n.audience !== "kids");
    if (!niches.length) return;
    const niche = niches[Math.floor(Math.random() * niches.length)];
    const topic = niche.topics[Math.floor(Math.random() * niche.topics.length)];
    router.push(`/studio/create?niche=${niche.id}&topic=${encodeURIComponent(topic)}`);
  };

  const [idea, setIdea] = useState("");
  const ask = (text: string) => { const message = text.trim(); if (message) router.push(`/studio/chat?q=${encodeURIComponent(message.slice(0, 600))}`); };

  const provider = overview?.status.providers.find((p) => p.configured);
  const stockOn = Boolean(overview?.config.allowStockVideo && overview?.status.stockMode?.available);
  const job = overview?.jobs[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{greeting()} <span className="inline-block">👋</span></h1>
          <p className="mt-1.5 text-sm text-mute">Let&apos;s turn your ideas into amazing videos.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button href="/studio/create" className="h-12 px-6"><Sparkles className="h-4 w-4" /> Create a video</Button>
            <Button href="/studio/chat" variant="outline" className="h-12"><NavIcon name="chat" className="h-4 w-4" /> Ask the AI</Button>
          </div>
        </div>

        {/* Chat box — type an idea, the AI writes the script + storyboard in AI Chat. */}
        <Panel className="!p-4">
          <p className="mb-2.5 flex items-center gap-2 text-xs font-bold text-mute"><NavIcon name="chat" className="h-4 w-4 text-lime" /> What should we make today?</p>
          <form onSubmit={(e) => { e.preventDefault(); ask(idea); }} className="flex items-end gap-2 rounded-2xl border border-white/10 bg-void/60 p-1.5 pl-4 focus-within:border-lime/40">
            <textarea value={idea} onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(idea); } }}
              rows={2} maxLength={600} placeholder="e.g. A 45 second scary story about a lighthouse keeper, dark cinematic, male voice"
              className="min-h-[44px] flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-dim" />
            <button type="submit" disabled={!idea.trim()} aria-label="Send to AI" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime text-void disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </form>
          <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5">
            {["30s motivation about discipline", "Scary story at 3 AM", "Psychology fact: why we procrastinate", "Kids bedtime story about a brave cloud"].map((text) => (
              <button key={text} type="button" onClick={() => ask(`Create a ${text}`)} className="shrink-0 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-semibold text-mute transition hover:border-lime/40 hover:text-cream">{text}</button>
            ))}
          </div>
        </Panel>

        {error && <div className="flex items-center gap-2 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"><AlertTriangle className="h-4 w-4" />{error}</div>}
        {overview && !provider && (
          <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-xs leading-relaxed text-amber-100">
            <strong>No AI video provider configured.</strong>{" "}
            {stockOn
              ? `New videos use free STOCK VIDEO footage (labelled)${overview.config.allowImageMode ? ", with IMAGE MODE for scenes stock can't match." : "."}`
              : overview.config.allowImageMode
                ? "New videos will render in IMAGE MODE (stills with camera motion, clearly labelled). For moving footage, turn on free STOCK VIDEO in "
                : "Turn on free STOCK VIDEO or IMAGE MODE in "}
            {!stockOn && <Link href="/studio/settings" className="font-bold text-lime underline">Settings</Link>}
          </div>
        )}

        <Panel>
          <PanelTitle icon={<NavIcon name="autopilot" className="h-4 w-4 text-lime" />} right={
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${autopilotActive ? "bg-lime/15 text-lime" : "bg-white/[0.06] text-dim"}`}>{autopilotActive ? "Running" : "Paused"}</span>
          }>Autopilot</PanelTitle>
          <Link href="/studio/autopilot" className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 hover:border-lime/30">
            <div>
              <p className="text-[11px] text-dim">Next video</p>
              <p className="text-sm font-bold">{nextRun ? nextRun.name : "No active series"}</p>
              {nextRun && <p className="text-[11px] text-dim">{timeUntil(nextRun.nextRunAt)} · {nextRun.format === "short" ? "9:16" : "16:9"}</p>}
            </div>
            <ArrowRight className="h-4 w-4 text-dim" />
          </Link>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void toggleAllAutopilot()} className="h-10 text-xs">{autopilotActive ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}</Button>
            <Button variant="outline" href="/studio/autopilot" className="h-10 text-xs"><NavIcon name="settings" className="h-3.5 w-3.5" /> Settings</Button>
          </div>
        </Panel>

        <div className="grid grid-cols-3 gap-3">
          {[["Today", overview?.activity.today], ["This week", overview?.activity.week], ["In queue", overview?.activity.queue]].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
              <p className="text-[11px] text-dim">{label}</p>
              <p className="mt-1 font-display text-xl font-bold">{value ?? "–"} <span className="text-xs font-semibold text-dim">videos</span></p>
            </div>
          ))}
        </div>

        {job && (
          <Panel>
            <PanelTitle icon={<NavIcon name="videos" className="h-4 w-4 text-violet-soft" />}>Generating now</PanelTitle>
            <Link href={`/studio/videos/${job.videoId}`} className="block">
              <div className="mb-2 flex justify-between text-sm"><span className="truncate font-bold">{job.title || "Writing story…"}</span><span className="text-lime">{job.progress}%</span></div>
              <Progress value={job.progress} />
              <p className="mt-2 truncate text-[11px] text-dim">{job.log.length ? job.log[job.log.length - 1].message : job.step}</p>
            </Link>
          </Panel>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-sm font-bold">Recent videos</h2><Link href="/studio/videos" className="text-xs font-semibold text-lime">View all</Link></div>
          {overview && overview.recent.length === 0 ? <Empty>No videos yet — create your first one.</Empty> : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">{(overview?.recent ?? []).slice(0, 4).map((video) => <VideoCard key={video.id} video={video} compact />)}</div>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelTitle icon={<NavIcon name="bolt" className="h-4 w-4 text-lime" />}>Niches</PanelTitle>
          <div className="space-y-1">
            {(overview?.niches ?? []).map((niche) => (
              <Link key={niche.id} href={`/studio/create?niche=${niche.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-base">{niche.emoji}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{niche.label}</span><span className="block truncate text-[11px] text-dim">{niche.description}</span></span>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelTitle>Quick action</PanelTitle>
          <button onClick={randomIdea} className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-left transition hover:border-lime/40">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-lime/15 text-lime"><Dices className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold">Random idea</span><span className="block text-[11px] text-dim">Pick a niche & topic for me</span></span>
          </button>
        </Panel>
      </div>
    </div>
  );
}
