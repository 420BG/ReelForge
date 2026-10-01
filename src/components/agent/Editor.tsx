"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Download, Film, Loader2, Play, RotateCcw, Save, Trash2, Upload, Wand2, X } from "lucide-react";
import { aspectOf, type AgentVideo, type PlanScene, type StoryPlan, type VideoSettings } from "@/content/types";
import { STYLES, VOICES } from "./Create";
import { api, fileUrl, formatDuration, post, useAgent } from "./data";
import { Button, Chip, ModeBadge, Panel, Progress, StatusPill, Toggle } from "./ui";

const STEP_LABEL: Record<string, string> = { story: "Writing story", voice: "Narration", clips: "Generating video clips", audio: "Audio design", segments: "Rendering scenes", compose: "Final mix", validate: "Validating", publish: "Publishing", done: "Done" };

export default function Editor({ id }: { id: string }) {
  const router = useRouter();
  const { notify, refresh } = useAgent();
  const [video, setVideo] = useState<AgentVideo | null>(null);
  const [draft, setDraft] = useState<StoryPlan | null>(null);
  const [settings, setSettings] = useState<VideoSettings | null>(null);
  const [dirty, setDirty] = useState<"story" | "settings" | null>(null);
  const [tab, setTab] = useState<"script" | "scenes" | "settings" | "log">("scenes");
  const [busy, setBusy] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ video: AgentVideo }>(`/api/agent/videos/${id}`);
      setVideo(data.video);
      setDraft((prev) => (dirty === "story" && prev ? prev : data.video.story));
      setSettings((prev) => (dirty === "settings" && prev ? prev : data.video.settings));
    } catch { setMissing(true); }
  }, [id, dirty]);

  useEffect(() => { void load(); }, [load]);
  const running = Boolean(video?.job && ["queued", "running", "waiting"].includes(video.job.state));
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { void fetch("/api/agent/tick", { method: "POST" }).catch(() => undefined).then(load); }, 5000);
    return () => window.clearInterval(timer);
  }, [running, load]);

  const timeline = useMemo(() => {
    let t = 0;
    return (draft?.scenes ?? []).map((scene) => { const start = t; t += scene.duration; return { start, end: t }; });
  }, [draft]);

  async function act(action: string, extra: Record<string, unknown> = {}, success = "Done.") {
    setBusy(action);
    try {
      const data = await api<{ video: AgentVideo; url?: string }>(`/api/agent/videos/${id}/action`, post({ action, ...extra }));
      setVideo(data.video);
      notify(data.url ? `Published: ${data.url}` : success);
      void refresh(true);
    } catch (error) { notify(error instanceof Error ? error.message : "Action failed.", "error"); }
    finally { setBusy(null); }
  }
  async function patch(body: Record<string, unknown>, success: string) {
    setBusy("save");
    try {
      const data = await api<{ video: AgentVideo; changed: string[] }>(`/api/agent/videos/${id}`, post(body, "PATCH"));
      setVideo(data.video); setDraft(data.video.story); setSettings(data.video.settings); setDirty(null);
      notify(data.changed.length ? `${success} Changed scenes will regenerate when you render.` : success);
      return true;
    } catch (error) { notify(error instanceof Error ? error.message : "Save failed.", "error"); return false; }
    finally { setBusy(null); }
  }
  async function render() {
    if (dirty === "story" && !(await patch({ story: draft }, "Saved."))) return;
    if (dirty === "settings" && !(await patch({ settings }, "Saved."))) return;
    await act(video?.hasFinal ? "recompose" : "produce", {}, "Rendering started.");
  }
  async function remove() {
    if (!window.confirm("Delete this video and its files? This can't be undone.")) return;
    try { await api(`/api/agent/videos/${id}`, { method: "DELETE" }); notify("Video deleted."); router.push("/studio/videos"); }
    catch (error) { notify(error instanceof Error ? error.message : "Delete failed.", "error"); }
  }
  const editScene = (index: number, key: keyof PlanScene, value: string) => {
    if (!draft) return;
    setDirty("story");
    setDraft({ ...draft, scenes: draft.scenes.map((s) => (s.index === index ? { ...s, [key]: value } : s)) });
  };
  const editSettings = (next: VideoSettings) => { setDirty("settings"); setSettings(next); };

  if (missing) return <div className="py-20 text-center text-sm text-dim">Video not found. <Link href="/studio/videos" className="text-lime">Back to My Videos</Link></div>;
  if (!video || !settings) return <div className="flex justify-center py-20 text-dim"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const long = settings.format === "long";
  const wide = aspectOf(settings) === "16:9";
  const job = video.job;
  const assetsFor = (index: number) => (video.assets ?? []).filter((a) => a.sceneIndex === index);
  const needsRecompose = video.hasFinal && video.workflow !== "published";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/studio/videos" className="text-xs font-semibold text-dim hover:text-cream">← Back</Link>
        <div className="flex items-center gap-2"><ModeBadge video={video} /><StatusPill workflow={video.workflow} /></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* preview */}
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-black">
            {video.hasFinal
              ? <video key={video.updatedAt} controls playsInline preload="metadata" className={`${wide ? "aspect-video" : "aspect-[9/16]"} w-full`} poster={video.hasCover ? fileUrl(video.id, "cover", `&v=${encodeURIComponent(video.updatedAt)}`) : undefined} src={fileUrl(video.id, "final", `&v=${encodeURIComponent(video.updatedAt)}`)} />
              : video.hasCover
                ? <img src={fileUrl(video.id, "cover")} alt="" className={`${wide ? "aspect-video" : "aspect-[9/16]"} w-full object-cover`} />
                : <div className="grid aspect-[9/16] w-full place-items-center bg-gradient-to-b from-violet/20 to-void text-center text-sm text-dim"><div><Film className="mx-auto mb-2 h-8 w-8" />{running ? "Rendering…" : "Not rendered yet"}</div></div>}
          </div>
          {job && running && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="mb-2 flex justify-between text-xs"><span className="font-semibold">{STEP_LABEL[job.step] ?? job.step}{job.currentScene != null ? ` · scene ${job.currentScene + 1}` : ""}</span><span className="text-lime">{job.progress}%</span></div>
              <Progress value={job.progress} />
              {job.log.length > 0 && <p className="mt-2 truncate text-[11px] text-dim">{job.log[job.log.length - 1].message}</p>}
            </div>
          )}
          {video.workflow === "failed" && video.error && <div className="flex gap-2 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200"><AlertTriangle className="h-4 w-4 shrink-0" />{video.error}</div>}
          {video.warnings.length > 0 && <ul className="space-y-1 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-[11px] text-amber-100">{video.warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}

          <div className="grid gap-2">
            {!running && video.workflow !== "published" && <Button onClick={() => void render()} busy={busy === "produce" || busy === "recompose"} disabled={busy !== null}><Play className="h-4 w-4" /> {video.hasFinal ? (dirty ? "Save & re-render" : "Re-render video") : "Render video"}</Button>}
            {video.workflow === "failed" && <Button variant="outline" onClick={() => void act("retry", {}, "Retrying failed parts only.")} disabled={busy !== null}><RotateCcw className="h-4 w-4" /> Retry failed parts</Button>}
            {video.workflow === "review" && <Button variant="good" onClick={() => void patch({ workflow: "approved" }, "Approved.")} disabled={busy !== null}><CheckCircle2 className="h-4 w-4" /> Approve</Button>}
            {(video.workflow === "approved" || video.workflow === "review") && <Button variant="outline" href={`/studio/videos/${video.id}/publish`}><Upload className="h-4 w-4" /> Publish to YouTube</Button>}
            {video.youtubeVideoId && <Button variant="outline" href={`https://youtu.be/${video.youtubeVideoId}`}>Open on YouTube <ArrowRight className="h-4 w-4" /></Button>}
            <div className="grid grid-cols-2 gap-2">
              {video.hasFinal && <Button variant="outline" href={fileUrl(video.id, "final", "&download=1")} className="text-xs"><Download className="h-3.5 w-3.5" /> Download</Button>}
              {running ? <Button variant="outline" onClick={() => void act("cancel", {}, "Cancelled.")} className="text-xs"><X className="h-3.5 w-3.5" /> Cancel</Button>
                : video.workflow !== "published" && <Button variant="outline" className="text-xs" onClick={() => { if (window.confirm("Write a brand-new story? All scenes will be regenerated.")) void act("rewrite-story", {}, "Rewriting the story."); }}><Wand2 className="h-3.5 w-3.5" /> New story</Button>}
              <Button variant="danger" onClick={() => void remove()} disabled={running} className="text-xs"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
            </div>
          </div>
        </div>

        {/* script / scenes / settings */}
        <Panel className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight">{video.title || "Story pending…"}</h1>
          <p className="mt-1 text-xs text-dim">{video.niche} · {long ? "Long" : "Short"} {aspectOf(settings)} · {formatDuration(video.durationSec ?? settings.targetDuration)} · {video.audience === "kids" ? "made for kids" : "not made for kids"}{video.story ? ` · story by ${video.story.source === "ai" ? "AI" : "template writer"}` : ""}</p>

          {draft && draft.scenes.length > 0 && (
            <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
              {draft.scenes.map((scene, i) => {
                const clip = assetsFor(scene.index).find((a) => a.kind === "clip");
                return (
                  <button key={scene.index} type="button" onClick={() => { setTab("scenes"); document.getElementById(`scene-${scene.index}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="w-24 shrink-0 text-left">
                    <div className={`relative ${wide ? "aspect-video" : "aspect-[9/16]"} overflow-hidden rounded-xl border border-white/[0.08] bg-ink`}>
                      {clip?.status === "done" ? (clip.mode === "image"
                        ? <img src={fileUrl(video.id, "clip", `&scene=${scene.index}&v=${encodeURIComponent(clip.updatedAt)}`)} alt="" className="h-full w-full object-cover" />
                        : <video muted playsInline preload="metadata" src={`${fileUrl(video.id, "clip", `&scene=${scene.index}&v=${encodeURIComponent(clip.updatedAt)}`)}#t=0.5`} className="h-full w-full object-cover" />)
                        : <div className="grid h-full place-items-center text-dim">{clip?.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : clip?.status === "failed" ? <AlertTriangle className="h-4 w-4 text-red-300" /> : <Film className="h-4 w-4" />}</div>}
                    </div>
                    <p className="mt-1 truncate text-[10px] font-semibold">{i + 1}. {scene.beat}</p>
                    <p className="text-[10px] text-dim">{formatDuration(timeline[i]?.start)}–{formatDuration(timeline[i]?.end)}</p>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["script", "scenes", "settings", "log"] as const).map((t) => <Chip key={t} on={tab === t} onClick={() => setTab(t)}>{t === "log" ? "Job log" : t[0].toUpperCase() + t.slice(1)}</Chip>)}
            {dirty && <Button onClick={() => void (dirty === "story" ? patch({ story: draft }, "Saved.") : patch({ settings }, "Saved."))} busy={busy === "save"} className="ml-auto h-9 text-xs"><Save className="h-3.5 w-3.5" /> Save changes</Button>}
          </div>

          <div className="mt-4">
            {!draft && tab !== "settings" && tab !== "log" && <p className="py-10 text-center text-sm text-dim">{running ? "The story is being written…" : "No story yet — press Render video."}</p>}

            {draft && tab === "script" && (
              <div className="space-y-3 text-sm">
                <p><span className="text-dim">Hook:</span> <span className="font-semibold">{draft.hook}</span></p>
                <p className="text-mute">{draft.concept}</p>
                {draft.characters.length > 0 && <div className="rounded-2xl border border-white/[0.07] p-3 text-xs text-mute">{draft.characters.map((c) => <p key={c.id}><span className="font-bold text-cream">{c.name}</span> — {[c.ageRange, c.appearance, c.hair, c.clothing].filter(Boolean).join(", ")}</p>)}</div>}
                <ol className="space-y-2">{draft.scenes.map((scene) => <li key={scene.index} className="rounded-xl bg-white/[0.03] px-3 py-2"><span className="mr-2 text-[10px] font-bold uppercase text-lime">{scene.beat}</span>{scene.narration}</li>)}</ol>
                <p className="text-xs text-dim">Music: {draft.musicMood} · Tone: {draft.tone}</p>
              </div>
            )}

            {draft && tab === "scenes" && (
              <div className="space-y-3">
                {draft.scenes.map((scene) => {
                  const assets = assetsFor(scene.index);
                  const clip = assets.find((a) => a.kind === "clip");
                  const voice = assets.find((a) => a.kind === "voice");
                  return (
                    <div key={scene.index} id={`scene-${scene.index}`} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="font-display text-xs font-bold">Scene {scene.index + 1}</span>
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-mute">{scene.beat}</span>
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-mute">{scene.camera}</span>
                        {scene.atmosphere.map((fx) => <span key={fx} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-mute">{fx}</span>)}
                        <span className="ml-auto text-dim">{clip?.status === "done" ? (clip.mode === "image" ? "IMAGE MODE" : `AI video · ${clip.provider}`) : clip?.status ?? "pending"}</span>
                      </div>
                      {clip?.status === "failed" && clip.error && <p className="mb-2 text-[11px] text-red-300">{clip.error}</p>}
                      <label className="block text-[11px] text-dim">Narration<textarea rows={2} value={scene.narration} onChange={(e) => editScene(scene.index, "narration", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-void/60 p-2 text-sm text-cream outline-none focus:border-lime/50" /></label>
                      <label className="mt-2 block text-[11px] text-dim">Visual<textarea rows={2} value={scene.visual} onChange={(e) => editScene(scene.index, "visual", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-void/60 p-2 text-sm text-cream outline-none focus:border-lime/50" /></label>
                      <label className="mt-2 block text-[11px] text-dim">Animation<input value={scene.animation} onChange={(e) => editScene(scene.index, "animation", e.target.value)} className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-void/60 px-2 text-sm text-cream outline-none focus:border-lime/50" /></label>
                      <p className="mt-2 text-[11px] text-dim">SFX: {scene.sfx.join(", ") || "—"} · Transition: {scene.transition}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {voice?.status === "done" && <audio controls preload="none" src={fileUrl(video.id, "voice", `&scene=${scene.index}&v=${encodeURIComponent(voice.updatedAt)}`)} className="h-8 max-w-[220px]" />}
                        {!running && video.workflow !== "published" && <>
                          <Button variant="outline" disabled={busy !== null || dirty !== null} onClick={() => void act("regenerate-scene", { scene: scene.index }, `Regenerating scene ${scene.index + 1}.`)} className="h-8 text-[11px]"><RotateCcw className="h-3 w-3" /> Regenerate clip</Button>
                          <Button variant="ghost" disabled={busy !== null || dirty !== null} onClick={() => void act("regenerate-scene", { scene: scene.index, voice: true }, `Regenerating scene ${scene.index + 1} + voice.`)} className="h-8 text-[11px]">Clip + voice</Button>
                        </>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "settings" && (
              <div className="space-y-5">
                <div>
                  <p className="mb-2 text-xs font-semibold text-mute">Video format</p>
                  {(video.assets ?? []).some((a) => (a.kind === "keyframe" || a.kind === "clip") && a.status === "done")
                    ? <div className="flex gap-2"><Chip on>{aspectOf(settings)}</Chip><span className="self-center text-[11px] text-dim">{long ? "Long" : "Short"} · renders at {aspectOf(settings) === "16:9" ? "1920×1080" : "1080×1920"}. The frame is fixed once images are made.</span></div>
                    : <div className="flex flex-wrap items-center gap-2">{(["9:16", "16:9"] as const).map((a) => <Chip key={a} on={aspectOf(settings) === a} onClick={() => editSettings({ ...settings, aspect: a })}>{a === "9:16" ? "9:16 vertical" : "16:9 widescreen"}</Chip>)}<span className="text-[11px] text-dim">You can still change the frame — no images made yet.</span></div>}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-mute">Style</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{STYLES.map((s) => <button key={s.id} type="button" onClick={() => editSettings({ ...settings, style: s.id })} className={`rounded-xl border p-2.5 text-left text-xs font-bold ${settings.style === s.id ? "border-lime/60 bg-lime/[0.06]" : "border-white/[0.07]"}`}>{s.label}</button>)}</div>
                  <p className="mt-1 text-[11px] text-dim">Changing style affects newly generated clips (regenerate scenes to apply).</p>
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-mute">Narration voice</span>
                  <select value={settings.voiceId ?? ""} onChange={(e) => editSettings({ ...settings, voiceId: e.target.value || undefined, voiceProvider: e.target.value ? (e.target.value.startsWith("aura") ? "deepgram" : "free") : "auto" })} className="h-10 w-full rounded-xl border border-white/12 bg-ink px-3 text-sm outline-none">
                    {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </label>
                <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] text-sm">
                  <div className="flex items-center justify-between px-4 py-3"><span>Captions</span><Toggle on={settings.captions.animation !== "none"} onChange={(on) => editSettings({ ...settings, captions: { ...settings.captions, animation: on ? "pop" : "none" } })} /></div>
                  <div className="flex items-center justify-between px-4 py-3"><span>Background music</span><Toggle on={settings.music} onChange={(on) => editSettings({ ...settings, music: on })} /></div>
                  <div className="flex items-center justify-between px-4 py-3"><span>Sound effects</span><Toggle on={settings.sfx} onChange={(on) => editSettings({ ...settings, sfx: on })} /></div>
                  <div className="flex items-center justify-between px-4 py-3"><span>Caption style</span><div className="flex gap-1.5">{(["pop", "karaoke", "fade"] as const).map((a) => <Chip key={a} on={settings.captions.animation === a} onClick={() => editSettings({ ...settings, captions: { ...settings.captions, animation: a } })}>{a}</Chip>)}</div></div>
                  <div className="flex items-center justify-between px-4 py-3"><span>Caption position</span><div className="flex gap-1.5">{(["top", "center", "bottom"] as const).map((p) => <Chip key={p} on={settings.captions.position === p} onClick={() => editSettings({ ...settings, captions: { ...settings.captions, position: p } })}>{p}</Chip>)}</div></div>
                </div>
                {needsRecompose && <p className="text-[11px] text-dim">Captions, music and SFX changes apply on “Re-render video” without generating new AI clips.</p>}
              </div>
            )}

            {tab === "log" && (
              <div className="max-h-[520px] space-y-1 overflow-y-auto rounded-2xl bg-black/40 p-3 font-mono text-[11px]">
                {(job?.log ?? []).slice().reverse().map((entry, i) => <p key={i} className={entry.level === "error" ? "text-red-300" : entry.level === "warn" ? "text-amber-200" : "text-mute"}><span className="text-dim">{new Date(entry.at).toLocaleTimeString()} </span>{entry.message}</p>)}
                {!job && <p className="text-dim">No job yet.</p>}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
