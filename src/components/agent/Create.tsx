"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CheckCircle2, Dices, Play, Sparkles } from "lucide-react";
import { DEFAULT_VIDEO_SETTINGS, type AgentVideo, type VideoSettings, type VisualStyle } from "@/content/types";
import { api, post, useAgent } from "./data";
import { Button, Chip, Panel, Toggle } from "./ui";

export const STYLES: { id: VisualStyle; label: string; hint: string }[] = [
  { id: "cinematic", label: "Cinematic", hint: "Film look, shallow depth" },
  { id: "dark-cinematic", label: "Dark cinematic", hint: "Horror & suspense" },
  { id: "animation-3d", label: "3D Animation", hint: "Stylized characters" },
  { id: "anime", label: "Anime", hint: "Dramatic 2D" },
  { id: "realistic", label: "Realistic", hint: "Documentary" },
  { id: "storybook", label: "Storybook", hint: "Soft & friendly" },
];
export const VOICES = [
  { id: "", label: "Match the niche (recommended)" },
  { id: "lyra", label: "Lyra — soft storyteller (female)" },
  { id: "nova", label: "Nova — bright & hyped (female)" },
  { id: "sage", label: "Sage — calm (female)" },
  { id: "atlas", label: "Atlas — deep documentary (male)" },
  { id: "orion", label: "Orion — cinematic calm (male)" },
  { id: "aura-2-thalia-en", label: "Thalia — Deepgram HD (female, needs DEEPGRAM_API_KEY)" },
  { id: "aura-2-orion-en", label: "Orion HD — Deepgram (male, needs DEEPGRAM_API_KEY)" },
];

const STEPS = ["Topic", "Format", "Settings", "Review"];

export default function Create() {
  const router = useRouter();
  const params = useSearchParams();
  const { overview, notify, refresh } = useAgent();
  const niches = overview?.niches ?? [];
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState<"suggested" | "niches" | "custom" | "script">(params?.get("mode") === "script" ? "script" : "suggested");
  const [script, setScript] = useState("");
  const [niche, setNiche] = useState(params?.get("niche") ?? "motivation");
  const initialFormat = params?.get("format") === "long" ? "long" : "short";
  const [topic, setTopic] = useState(params?.get("topic") ?? "");
  const [custom, setCustom] = useState("");
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState<VideoSettings>({ ...DEFAULT_VIDEO_SETTINGS, format: initialFormat, targetDuration: initialFormat === "long" ? 300 : DEFAULT_VIDEO_SETTINGS.targetDuration });
  const long = settings.format === "long";
  const setFormat = (format: "short" | "long") => setSettings((s) => ({ ...s, format, targetDuration: format === "long" ? 300 : 30 }));
  const [busy, setBusy] = useState<"plan" | "produce" | null>(null);
  const current = niches.find((n) => n.id === niche);

  useEffect(() => { if (current) setSettings((s) => ({ ...s, style: current.defaultStyle })); }, [niche]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (params?.get("topic")) setTab("suggested"); }, [params]);

  const topics = useMemo(() => {
    const list = tab === "suggested"
      ? niches.filter((n) => n.audience !== "kids").flatMap((n) => n.topics.slice(0, 2).map((t) => ({ topic: t, niche: n })))
      : (current ? current.topics.map((t) => ({ topic: t, niche: current })) : []);
    const q = search.trim().toLowerCase();
    return q ? list.filter((item) => item.topic.toLowerCase().includes(q)) : list;
  }, [tab, niches, current, search]);

  const scriptWords = script.trim() ? script.trim().split(/\s+/).length : 0;
  const scriptSeconds = Math.round(scriptWords / 2.5);
  const scriptMode = tab === "script";
  const idea = scriptMode ? (scriptWords >= 8 ? script.trim().split(/\s+/).slice(0, 12).join(" ") : "") : tab === "custom" ? custom.trim() : topic;
  const set = <K extends keyof VideoSettings>(key: K, value: VideoSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  const randomTopic = () => {
    const pool = niches.filter((n) => n.audience !== "kids");
    if (!pool.length) return;
    const n = pool[Math.floor(Math.random() * pool.length)];
    setNiche(n.id);
    setTopic(n.topics[Math.floor(Math.random() * n.topics.length)]);
    setTab("suggested");
  };

  async function submit(mode: "plan" | "produce") {
    if (!idea) { notify("Pick or type a topic first.", "error"); setStep(1); return; }
    setBusy(mode);
    try {
      const data = await api<{ video: AgentVideo; note: string | null }>("/api/agent/videos", post({ niche, mode: scriptMode ? "produce" : mode, settings: { ...settings, idea: scriptMode ? undefined : idea, script: scriptMode ? script : undefined } }));
      notify(data.note ?? (mode === "plan" ? "Storyboard ready — review and edit it." : "Production started."));
      void refresh(true);
      router.push(`/studio/videos/${data.video.id}`);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not create the video.", "error"); }
    finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 font-display text-2xl font-bold tracking-tight sm:text-3xl">Create a Video</h1>
      <ol className="mb-6 grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <li key={label}>
              <button type="button" onClick={() => setStep(n)} className="flex w-full flex-col items-center gap-1.5">
                <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${step === n ? "bg-lime text-void shadow-[0_0_18px_rgba(217,255,77,0.4)]" : step > n ? "bg-lime/20 text-lime" : "border border-white/15 text-dim"}`}>{step > n ? <Check className="h-4 w-4" /> : n}</span>
                <span className={`text-[11px] font-semibold ${step === n ? "text-cream" : "text-dim"}`}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <Panel>
        {step === 1 && (
          <div>
            <h2 className="mb-4 font-display text-lg font-bold">1. Choose a topic</h2>
            <div className="mb-4 flex gap-2">
              {([["suggested", "Suggested"], ["niches", "By niche"], ["custom", "Story from idea"], ["script", "My script"]] as const).map(([id, label]) => <Chip key={id} on={tab === id} onClick={() => setTab(id)}>{label}</Chip>)}
            </div>
            {tab === "niches" && (
              <div className="mb-4 flex flex-wrap gap-2">{niches.map((n) => <Chip key={n.id} on={niche === n.id} onClick={() => setNiche(n.id)}>{n.emoji} {n.label}</Chip>)}</div>
            )}
            {tab === "script" ? (
              <div className="space-y-3">
                <p className="rounded-xl border border-lime/20 bg-lime/[0.04] p-3 text-[11px] leading-relaxed text-mute"><b className="text-cream">Script mode:</b> your words are the narration, exactly as written. The AI only designs a matching image and camera move for each line. Use “Story from idea” if you want the AI to write the story.</p>
                <div className="flex flex-wrap gap-2">{niches.map((n) => <Chip key={n.id} on={niche === n.id} onClick={() => setNiche(n.id)}>{n.emoji} {n.label}</Chip>)}</div>
                <textarea value={script} onChange={(e) => { setScript(e.target.value); const secs = Math.round(e.target.value.trim().split(/\s+/).length / 2.5); if (secs > 170 && settings.format === "short") setSettings((s) => ({ ...s, format: "long" })); }} rows={10} maxLength={15000} placeholder="Paste your full narration script here…" className="w-full rounded-xl border border-white/12 bg-white/[0.04] p-3 text-sm leading-relaxed outline-none placeholder:text-dim focus:border-lime/50" />
                <p className="text-[11px] text-dim">{scriptWords} words · about {scriptSeconds >= 90 ? `${Math.round(scriptSeconds / 60)} min` : `${scriptSeconds}s`} of narration · {scriptSeconds > 170 ? "will be a Long (16:9) video" : "fits a Short — or pick Long in the next step"}</p>
              </div>
            ) : tab === "custom" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">{niches.map((n) => <Chip key={n.id} on={niche === n.id} onClick={() => setNiche(n.id)}>{n.emoji} {n.label}</Chip>)}</div>
                <textarea value={custom} onChange={(e) => setCustom(e.target.value)} rows={4} maxLength={400} placeholder="Describe your video idea, e.g. “a night-shift guard hears his own voice on the radio”" className="w-full rounded-xl border border-white/12 bg-white/[0.04] p-3 text-sm outline-none placeholder:text-dim focus:border-lime/50" />
              </div>
            ) : (
              <>
                <div className="mb-3 flex gap-2">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for a topic…" className="h-11 flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm outline-none placeholder:text-dim focus:border-lime/50" />
                  <Button variant="outline" onClick={randomTopic} className="shrink-0"><Dices className="h-4 w-4" /> Random topic</Button>
                </div>
                <div className="space-y-2">
                  {topics.map((item) => {
                    const on = topic === item.topic;
                    return (
                      <button key={`${item.niche.id}-${item.topic}`} type="button" onClick={() => { setTopic(item.topic); setNiche(item.niche.id); }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${on ? "border-lime/60 bg-lime/[0.06] shadow-[0_0_0_1px_rgba(217,255,77,0.25)]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"}`}>
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-lg">{item.niche.emoji}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.topic}</span><span className="block text-[11px] text-dim">{item.niche.label} · {long ? "16:9" : "9:16"}</span></span>
                        {on ? <CheckCircle2 className="h-5 w-5 text-lime" /> : <ArrowRight className="h-4 w-4 text-dim" />}
                      </button>
                    );
                  })}
                  {topics.length === 0 && <p className="py-6 text-center text-sm text-dim">No topics match — try Custom.</p>}
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-display text-lg font-bold">2. Format</h2>
            <div>
              <p className="mb-2 text-xs font-semibold text-mute">Choose format</p>
              <div className="grid grid-cols-2 gap-3">
                {([["short", "Short · 9:16", "1080×1920 for YouTube Shorts"], ["long", "Long · 16:9", "1920×1080, several minutes, written in parts"]] as const).map(([id, label, hint]) => (
                  <button key={id} type="button" onClick={() => setFormat(id)} className={`rounded-2xl border p-4 text-left transition ${settings.format === id ? "border-lime/60 bg-lime/[0.06]" : "border-white/[0.07] hover:border-white/20"}`}><p className="font-bold">{label}</p><p className="text-[11px] text-dim">{hint}</p></button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-mute">Duration{scriptMode ? " (follows your script)" : ""}</p>
              {scriptMode ? <p className="rounded-xl border border-white/[0.07] px-4 py-3 text-sm">≈ {scriptSeconds >= 90 ? `${Math.round(scriptSeconds / 60)} min` : `${scriptSeconds}s`} — set by the length of your script.</p> : <div className="grid grid-cols-4 gap-2">{(long ? [180, 300, 480, 600] : [15, 30, 45, 60]).map((n) => <button key={n} type="button" onClick={() => set("targetDuration", n)} className={`h-12 rounded-xl border text-sm font-bold transition ${settings.targetDuration === n ? "border-lime bg-lime text-void" : "border-white/10 text-mute hover:text-cream"}`}>{long ? `${n / 60} min` : `${n}s`}</button>)}</div>}
              <p className="mt-2 text-[11px] text-dim">{long ? `About ${Math.round(settings.targetDuration / 9)} scenes (one AI image each), written in ${Math.max(2, Math.round(settings.targetDuration / 60))} parts. Progress is saved after every part and scene.` : "The final length follows the real narration, close to this target."}</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-display text-lg font-bold">3. Settings</h2>
            <div>
              <p className="mb-2 text-xs font-semibold text-mute">Style</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{STYLES.map((s) => (
                <button key={s.id} type="button" onClick={() => set("style", s.id)} className={`rounded-2xl border p-3 text-left transition ${settings.style === s.id ? "border-lime/60 bg-lime/[0.06]" : "border-white/[0.07] hover:border-white/20"}`}>
                  <p className="text-sm font-bold">{s.label}</p><p className="text-[11px] text-dim">{s.hint}</p>
                </button>
              ))}</div>
            </div>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-mute">Narration voice</span>
              <select value={settings.voiceId ?? ""} onChange={(e) => setSettings((s) => ({ ...s, voiceId: e.target.value || undefined, voiceProvider: e.target.value ? (e.target.value.startsWith("aura") ? "deepgram" : "free") : "auto" }))} className="h-11 w-full rounded-xl border border-white/12 bg-ink px-3 text-sm outline-none focus:border-lime/50">
                {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
            <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07]">
              {([
                ["Captions (animated)", settings.captions.animation !== "none", (on: boolean) => set("captions", { ...settings.captions, animation: on ? "pop" : "none" })],
                ["Background music (copyright-safe)", settings.music, (on: boolean) => set("music", on)],
                ["Sound effects & ambience", settings.sfx, (on: boolean) => set("sfx", on)],
                ["Character consistency", settings.consistency, (on: boolean) => set("consistency", on)],
              ] as [string, boolean, (on: boolean) => void][]).map(([label, on, change]) => (
                <div key={label} className="flex items-center justify-between px-4 py-3 text-sm"><span>{label}</span><Toggle on={on} onChange={change} label={label} /></div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span>Caption style</span>
                <div className="flex gap-1.5">{(["pop", "karaoke", "fade"] as const).map((a) => <Chip key={a} on={settings.captions.animation === a} onClick={() => set("captions", { ...settings.captions, animation: a })}>{a}</Chip>)}</div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span>Quality</span>
                <div className="flex gap-1.5"><Chip on={settings.quality === "draft"} onClick={() => set("quality", "draft")}>Low-cost draft</Chip><Chip on={settings.quality === "production"} onClick={() => set("quality", "production")}>Production</Chip></div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold">4. Review</h2>
            <dl className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] text-sm">
              {[
                [scriptMode ? "Mode" : "Topic", scriptMode ? `Script mode — your ${scriptWords} words, unchanged` : idea || "—"],
                ["Niche", current ? `${current.emoji} ${current.label}` : niche],
                ["Audience", current?.audience === "kids" ? "Made for kids" : "General (not made for kids)"],
                ["Format", long ? `Long · 16:9 · ~${Math.round(settings.targetDuration / 60)} min` : `Short · 9:16 · ~${settings.targetDuration}s`],
                ["Style", STYLES.find((s) => s.id === settings.style)?.label ?? settings.style],
                ["Voice", VOICES.find((v) => v.id === (settings.voiceId ?? ""))?.label ?? "Match the niche"],
                ["Visuals", (() => { const ai = overview?.status.providers.find((p) => p.usable); return ai && overview?.config.aiVideoScenes !== "none" ? `AI image per scene → ${ai.label} image-to-video (falls back to camera motion)` : "AI image per scene + camera motion"; })()],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-dim">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
            </dl>
            <div className="grid gap-2 sm:grid-cols-2">
              {!long && !scriptMode && <Button variant="outline" busy={busy === "plan"} disabled={busy !== null} onClick={() => void submit("plan")}><Sparkles className="h-4 w-4" /> Write storyboard first</Button>}
              <Button busy={busy === "produce"} disabled={busy !== null} onClick={() => void submit("produce")}><Play className="h-4 w-4" /> Produce now</Button>
            </div>
            <p className="text-[11px] text-dim">Nothing is published automatically — every video waits for your approval.</p>
          </div>
        )}
      </Panel>

      <div className="mt-4 flex justify-between">
        {step > 1 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
        {step < 4 && <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !idea} className="px-8">Next <ArrowRight className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
}
