"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { api, post, useAgent } from "./data";
import { Button, Chip, Panel, PanelTitle, Toggle } from "./ui";

/* Agent Autopilot: generate N videos in one go (ideas → scripts → clips → voice → render → review). */
export default function AgentBatch() {
  const { overview, notify, refresh } = useAgent();
  const [niche, setNiche] = useState("auto");
  const [count, setCount] = useState(3);
  const [range, setRange] = useState<[number, number]>([30, 45]);
  const [gender, setGender] = useState<"auto" | "female" | "male">("auto");
  const [autoPublish, setAutoPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const max = overview?.config.maxVideosPerBatch ?? 10;
  const masterOn = Boolean(overview?.config.autoPublishEnabled);

  async function start() {
    setBusy(true);
    try {
      const result = await api<{ created: unknown[]; notes: string[]; autoPublish: boolean }>("/api/agent/autopilot", post({
        niche, count, minDuration: range[0], maxDuration: range[1],
        settings: { voiceGender: gender, autoPublish: autoPublish && masterOn, allowImageMode: overview?.config.allowImageMode ?? false },
      }));
      notify(`Queued ${result.created.length} video(s).${result.autoPublish ? " They will auto-publish." : " Each waits for your review."}`);
      void refresh(true);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not start.", "error"); }
    finally { setBusy(false); }
  }

  return (
    <Panel className="mb-6">
      <PanelTitle icon={<Zap className="h-4 w-4 text-lime" />} right={<span className="text-[11px] text-dim">ideas → script → scenes → voice → render → review</span>}>Agent Autopilot — make a batch now</PanelTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-mute">Niche
          <select value={niche} onChange={(e) => setNiche(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/12 bg-ink px-3 text-sm text-cream outline-none">
            <option value="auto">Let AI choose (rotates niches)</option>
            {(overview?.niches ?? []).map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-mute">Number of videos (max {max})
          <input type="number" min={1} max={max} value={count} onChange={(e) => setCount(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} className="mt-1 h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-cream outline-none" />
        </label>
        <div><p className="mb-1 text-xs font-semibold text-mute">Duration</p><div className="flex flex-wrap gap-1.5">{([[15, 30], [30, 45], [45, 60]] as [number, number][]).map((r) => <Chip key={r.join()} on={range[0] === r[0]} onClick={() => setRange(r)}>{r[0]}–{r[1]}s</Chip>)}</div></div>
        <div><p className="mb-1 text-xs font-semibold text-mute">Voice</p><div className="flex gap-1.5">{(["auto", "female", "male"] as const).map((g) => <Chip key={g} on={gender === g} onClick={() => setGender(g)}>{g === "auto" ? "Match niche" : g}</Chip>)}</div></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-mute"><Toggle on={autoPublish && masterOn} onChange={(on) => setAutoPublish(on)} label="Auto-publish" />Auto-publish after validation {!masterOn && <span className="text-dim">(turn on the master switch in Settings first)</span>}</label>
        <Button onClick={() => void start()} busy={busy}><Zap className="h-4 w-4" /> Start batch</Button>
      </div>
    </Panel>
  );
}
