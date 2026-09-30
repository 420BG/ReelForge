"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, AudioLines, Captions, Check, CheckCircle2, Clapperboard, Clock3, ExternalLink, Film, FolderOpen, History, Info,
  LayoutDashboard, LoaderCircle, Music2, Play, RefreshCw, Save, Send, Settings2, ShieldCheck, Sparkles, Trash2, Video, WandSparkles, X, Zap,
} from "lucide-react";
import { apiRequest, jsonRequest } from "@/lib/client-api";
import type { AgentConfig, AgentJob, AgentVideo, CaptionSettings, PlanScene, StoryPlan, VideoSettings, VisualStyle, Workflow } from "@/content/types";
import { DEFAULT_VIDEO_SETTINGS } from "@/content/types";

type Notify = (message: string, kind?: "success" | "error" | "info") => void;
type Tab = "dashboard" | "create" | "autopilot" | "library" | "settings";
type NicheSummary = { id: string; label: string; emoji: string; description: string; audience: "general" | "kids"; subNiches: { id: string; label: string }[]; defaultStyle: VisualStyle; pacing: string };
type ProviderInfo = { id: string; label: string; paid: boolean; configured: boolean; capabilities: { textToVideo: boolean; imageToVideo: boolean }; pricePerSecond: number | null };
type ActiveJob = AgentJob & { title: string; niche: string; provider: string | null };
type Overview = {
  counts: Record<Workflow | "total", number>;
  jobs: ActiveJob[];
  failures: (AgentJob & { title: string })[];
  usage: { clips: number; cost: number };
  recent: AgentVideo[];
  config: AgentConfig;
  niches: NicheSummary[];
  status: {
    providers: ProviderInfo[]; textModel: boolean; voice: { pollinations: boolean; elevenlabs: boolean };
    imageMode: { allowed: boolean; available: boolean }; ffmpeg: boolean; youtubeConnected: boolean; youtubeChannelTitle: string | null; worker: string;
  };
};

const STYLES: { id: VisualStyle; label: string }[] = [
  { id: "cinematic", label: "Cinematic" }, { id: "dark-cinematic", label: "Dark cinematic" }, { id: "animation-3d", label: "3D animation" },
  { id: "anime", label: "Anime" }, { id: "realistic", label: "Realistic" }, { id: "storybook", label: "Storybook" },
];
const WORKFLOW_LABEL: Record<Workflow, string> = { draft: "Draft", processing: "Processing", review: "In review", approved: "Approved", published: "Published", failed: "Failed" };
const STEP_LABEL: Record<AgentJob["step"], string> = { story: "Writing story", voice: "Narration", clips: "Generating video clips", audio: "Audio design", segments: "Rendering scenes", compose: "Final mix", validate: "Validating", publish: "Publishing", done: "Done" };

const fileUrl = (id: string, kind: string, extra = "") => `/api/agent/videos/${id}/file?kind=${kind}${extra}`;
const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

function Chip({ workflow }: { workflow: Workflow }) {
  return <span className={`ag-chip ag-chip-${workflow}`}>{WORKFLOW_LABEL[workflow]}</span>;
}

function ModeBadge({ video }: { video: AgentVideo }) {
  if (!video.renderMode) return null;
  return video.renderMode === "video"
    ? <span className="ag-badge ag-badge-video"><Video size={12} /> AI VIDEO</span>
    : <span className="ag-badge ag-badge-image"><Film size={12} /> IMAGE MODE{video.renderMode === "mixed" ? " (partial)" : ""}</span>;
}

function Progress({ value }: { value: number }) {
  return <div className="ag-progress"><span style={{ width: `${Math.max(2, Math.min(100, value))}%` }} /></div>;
}

/* ------------------------------------------------------------------ */

export default function AgentStudio({ notify, requireAccess }: { notify: Notify; requireAccess: () => boolean }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [videos, setVideos] = useState<AgentVideo[]>([]);
  const [filter, setFilter] = useState<"all" | Workflow>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const refresh = useCallback(async (drive = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (drive) await apiRequest("/api/agent/tick", { method: "POST" }).catch(() => undefined);
      const [data, list] = await Promise.all([
        apiRequest<Overview>("/api/agent/overview"),
        apiRequest<{ videos: AgentVideo[] }>(`/api/agent/videos?workflow=${filter}`),
      ]);
      setOverview(data);
      setVideos(list.videos);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the agent.");
    } finally {
      busyRef.current = false;
    }
  }, [filter]);

  const active = (overview?.jobs.length ?? 0) > 0;
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => { void refresh(active); }, active ? 4000 : 20000);
    return () => clearInterval(timer);
  }, [refresh, active]);

  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "create", label: "Create", icon: WandSparkles },
    { id: "autopilot", label: "Autopilot", icon: Zap },
    { id: "library", label: "My videos", icon: FolderOpen },
    { id: "settings", label: "Agent settings", icon: Settings2 },
  ];

  return (
    <div className="ag-root">
      <header className="ag-header">
        <div className="ag-brand"><span className="ag-logo"><Clapperboard size={20} /></span><div><strong>Shorts Agent</strong><small>Faceless AI video — idea to upload</small></div></div>
        <nav className="ag-tabs">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={15} />{label}</button>)}</nav>
      </header>
      {loadError && <div className="ag-alert ag-alert-error"><Info size={16} /> {loadError}</div>}
      {overview && <StatusStrip overview={overview} />}
      {!overview && !loadError && <div className="ag-empty"><LoaderCircle className="spin" size={22} /> Loading agent…</div>}
      {overview && tab === "dashboard" && <Dashboard overview={overview} onOpen={setOpenId} onCreate={() => setTab("create")} notify={notify} refresh={() => refresh(true)} />}
      {overview && tab === "create" && <Create overview={overview} notify={notify} requireAccess={requireAccess} onCreated={(video) => { setOpenId(video.id); void refresh(true); }} />}
      {overview && tab === "autopilot" && <Autopilot overview={overview} notify={notify} requireAccess={requireAccess} onStarted={() => { setTab("dashboard"); void refresh(true); }} />}
      {overview && tab === "library" && <Library videos={videos} filter={filter} setFilter={setFilter} counts={overview.counts} onOpen={setOpenId} />}
      {overview && tab === "settings" && <AgentSettings overview={overview} notify={notify} onSaved={() => refresh()} />}
      {openId && <VideoDetail id={openId} notify={notify} onClose={() => { setOpenId(null); void refresh(); }} onChanged={() => refresh(true)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatusStrip({ overview }: { overview: Overview }) {
  const { status } = overview;
  const videoProvider = status.providers.find((provider) => provider.configured);
  const items = [
    { ok: Boolean(videoProvider), label: videoProvider ? `Video: ${videoProvider.label}` : "Video provider not configured" },
    { ok: status.textModel, label: status.textModel ? "Story model ready" : "Story: template writer only" },
    { ok: status.voice.pollinations || status.voice.elevenlabs, label: status.voice.elevenlabs ? "Voice: ElevenLabs" : status.voice.pollinations ? "Voice: Kokoro" : "No voice provider" },
    { ok: status.ffmpeg, label: status.ffmpeg ? "Renderer ready" : "ffmpeg missing" },
    { ok: status.youtubeConnected, label: status.youtubeConnected ? `YouTube: ${status.youtubeChannelTitle ?? "connected"}` : "YouTube not connected" },
  ];
  return <div className="ag-strip">{items.map((item) => <span key={item.label} className={item.ok ? "ok" : "warn"}>{item.ok ? <Check size={13} /> : <Info size={13} />}{item.label}</span>)}{status.imageMode.allowed && <span className="warn"><Film size={13} /> IMAGE MODE fallback allowed</span>}</div>;
}

function Dashboard({ overview, onOpen, onCreate, notify, refresh }: { overview: Overview; onOpen: (id: string) => void; onCreate: () => void; notify: Notify; refresh: () => Promise<void> }) {
  const { counts, jobs, failures, usage, recent, config } = overview;
  const stats: [string, number, string][] = [["Total videos", counts.total, ""], ["Drafts", counts.draft, "draft"], ["Processing", counts.processing, "processing"], ["Ready for review", counts.review + counts.approved, "review"], ["Published", counts.published, "published"], ["Failed", counts.failed, "failed"]];
  async function retry(videoId: string) {
    try { await apiRequest(`/api/agent/videos/${videoId}/action`, jsonRequest({ action: "retry" })); notify("Retrying — finished scenes are kept.", "success"); await refresh(); }
    catch (error) { notify(error instanceof Error ? error.message : "Retry failed.", "error"); }
  }
  return (
    <div className="ag-grid-dash">
      <section className="ag-stats">{stats.map(([label, value, tone]) => <div key={label} className={`ag-stat ${tone}`}><strong>{value}</strong><span>{label}</span></div>)}</section>
      <section className="ag-card ag-jobs">
        <div className="ag-card-head"><h3><LoaderCircle size={16} className={jobs.length ? "spin" : ""} /> Current generation</h3><button className="ag-btn ghost" onClick={() => void refresh()}><RefreshCw size={14} /> Refresh</button></div>
        {jobs.length === 0 && <div className="ag-empty small">Nothing running. <button className="ag-link" onClick={onCreate}>Create a video <ArrowRight size={13} /></button></div>}
        {jobs.map((job) => (
          <button key={job.id} className="ag-job" onClick={() => onOpen(job.videoId)}>
            <div className="ag-job-top"><strong>{job.title || "Writing story…"}</strong><span>{job.progress}%</span></div>
            <Progress value={job.progress} />
            <div className="ag-job-meta">
              <span>{STEP_LABEL[job.step]}{job.currentScene != null ? ` · scene ${job.currentScene + 1}` : ""}</span>
              <span>{job.provider ? `via ${job.provider}` : job.niche}</span>
              <span>{job.state === "waiting" ? `waiting until ${new Date(job.nextRunAt).toLocaleTimeString()}` : job.state}</span>
            </div>
            {job.error && <div className="ag-job-error">{job.error}</div>}
            {job.log.length > 0 && <div className="ag-job-log">{job.log[job.log.length - 1].message}</div>}
          </button>
        ))}
        {jobs.length > 0 && <p className="ag-footnote"><Clock3 size={12} /> Estimated remaining: {estimateRemaining(jobs)}. AI clips typically take 1–5 minutes each.</p>}
      </section>
      <section className="ag-card">
        <div className="ag-card-head"><h3><ShieldCheck size={16} /> Cost & limits today</h3></div>
        <div className="ag-kv"><span>Clips generated</span><strong>{usage.clips} / {config.dailyClipLimit}</strong></div>
        <div className="ag-kv"><span>Estimated spend</span><strong>{usage.cost > 0 ? `$${usage.cost.toFixed(2)}` : "—"}</strong></div>
        <div className="ag-kv"><span>Max scenes / attempts</span><strong>{config.maxScenesPerVideo} / {config.maxAttemptsPerScene}</strong></div>
        <div className="ag-kv"><span>Auto-publish</span><strong>{config.autoPublishEnabled ? "Enabled" : "Off (review first)"}</strong></div>
      </section>
      <section className="ag-card">
        <div className="ag-card-head"><h3><Info size={16} /> Errors</h3></div>
        {failures.length === 0 ? <div className="ag-empty small">No failed jobs.</div> : failures.map((job) => (
          <div key={job.id} className="ag-fail">
            <button className="ag-link" onClick={() => onOpen(job.videoId)}>{job.title}</button>
            <p>{job.error}</p>
            <button className="ag-btn small" onClick={() => void retry(job.videoId)}><RefreshCw size={13} /> Retry</button>
          </div>
        ))}
      </section>
      <section className="ag-card ag-recent">
        <div className="ag-card-head"><h3><History size={16} /> Recent videos</h3></div>
        <div className="ag-thumbs">{recent.length === 0 ? <div className="ag-empty small">No videos yet.</div> : recent.map((video) => <VideoCard key={video.id} video={video} onOpen={() => onOpen(video.id)} />)}</div>
      </section>
    </div>
  );
}

function estimateRemaining(jobs: ActiveJob[]) {
  const minutes = jobs.reduce((sum, job) => sum + Math.max(1, Math.round(((100 - job.progress) / 100) * 12)), 0);
  return minutes < 60 ? `~${minutes} min` : `~${(minutes / 60).toFixed(1)} h`;
}

function VideoCard({ video, onOpen }: { video: AgentVideo; onOpen: () => void }) {
  return (
    <button className="ag-vcard" onClick={onOpen}>
      <div className="ag-vthumb">
        {video.hasCover ? <img src={fileUrl(video.id, "cover", `&v=${encodeURIComponent(video.updatedAt)}`)} alt="" /> : <div className="ag-vthumb-empty"><Clapperboard size={22} /></div>}
        {video.durationSec ? <span className="ag-dur">{Math.round(video.durationSec)}s</span> : null}
      </div>
      <div className="ag-vbody">
        <strong>{video.title || "Untitled (story pending)"}</strong>
        <div className="ag-vmeta"><Chip workflow={video.workflow} /><ModeBadge video={video} /></div>
        {video.job && ["queued", "running", "waiting"].includes(video.job.state) && <Progress value={video.job.progress} />}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */

function SettingsFields({ settings, setSettings, overview }: { settings: VideoSettings; setSettings: (next: VideoSettings) => void; overview: Overview }) {
  const set = <K extends keyof VideoSettings>(key: K, value: VideoSettings[K]) => setSettings({ ...settings, [key]: value });
  const setCap = <K extends keyof CaptionSettings>(key: K, value: CaptionSettings[K]) => setSettings({ ...settings, captions: { ...settings.captions, [key]: value } });
  const providers = overview.status.providers;
  return (
    <div className="ag-form-grid">
      <label>Duration<div className="ag-seg">{[15, 30, 45, 60].map((n) => <button key={n} className={settings.targetDuration === n ? "on" : ""} onClick={() => set("targetDuration", n)}>{n}s</button>)}</div></label>
      <label>Visual style<select value={settings.style} onChange={(e) => set("style", e.target.value as VisualStyle)}>{STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}</select></label>
      <label>Video provider<select value={settings.provider} onChange={(e) => set("provider", e.target.value as VideoSettings["provider"])}>
        <option value="auto">Auto (first configured)</option>
        {providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.configured}>{provider.label}{provider.configured ? "" : " — not configured"}{provider.paid ? " (paid)" : ""}</option>)}
      </select></label>
      <label>Quality<div className="ag-seg"><button className={settings.quality === "draft" ? "on" : ""} onClick={() => set("quality", "draft")}>Low-cost draft</button><button className={settings.quality === "production" ? "on" : ""} onClick={() => set("quality", "production")}>Production</button></div></label>
      <label>Narrator<div className="ag-seg">{(["auto", "female", "male"] as const).map((g) => <button key={g} className={settings.voiceGender === g ? "on" : ""} onClick={() => set("voiceGender", g)}>{g === "auto" ? "Match niche" : g}</button>)}</div></label>
      <label>Voice provider<select value={settings.voiceProvider} onChange={(e) => set("voiceProvider", e.target.value as VideoSettings["voiceProvider"])}>
        <option value="auto">Auto</option><option value="pollinations" disabled={!overview.status.voice.pollinations}>Pollinations Kokoro</option><option value="elevenlabs" disabled={!overview.status.voice.elevenlabs}>ElevenLabs</option><option value="none">No narration</option>
      </select></label>
      <label>Captions<div className="ag-seg">{(["pop", "karaoke", "fade", "none"] as const).map((a) => <button key={a} className={settings.captions.animation === a ? "on" : ""} onClick={() => setCap("animation", a)}>{a === "none" ? "static" : a}</button>)}</div></label>
      <label>Caption position<div className="ag-seg">{(["top", "center", "bottom"] as const).map((p) => <button key={p} className={settings.captions.position === p ? "on" : ""} onClick={() => setCap("position", p)}>{p}</button>)}</div></label>
      <label>Caption size <input type="range" min={60} max={130} value={settings.captions.size} onChange={(e) => setCap("size", Number(e.target.value))} /><small>{settings.captions.size}px</small></label>
      <label>Caption colors<div className="ag-row"><input type="color" value={settings.captions.color} onChange={(e) => setCap("color", e.target.value)} /><input type="color" value={settings.captions.highlight} onChange={(e) => setCap("highlight", e.target.value)} /><small>text / highlight</small></div></label>
      <label className="ag-check"><input type="checkbox" checked={settings.music} onChange={(e) => set("music", e.target.checked)} /> <Music2 size={14} /> Background music (synthesized, copyright-safe)</label>
      <label className="ag-check"><input type="checkbox" checked={settings.sfx} onChange={(e) => set("sfx", e.target.checked)} /> <AudioLines size={14} /> Sound effects & ambience</label>
      <label className="ag-check"><input type="checkbox" checked={settings.consistency} onChange={(e) => set("consistency", e.target.checked)} /> Character consistency (keyframes + fixed seeds where supported)</label>
      <label className="ag-check"><input type="checkbox" checked={settings.captions.hookTitle} onChange={(e) => setCap("hookTitle", e.target.checked)} /> <Captions size={14} /> Hook title in the first seconds</label>
      <label className="ag-check"><input type="checkbox" disabled={!overview.config.allowImageMode} checked={settings.allowImageMode} onChange={(e) => set("allowImageMode", e.target.checked)} /> Allow IMAGE MODE fallback (stills + camera motion — not AI video){!overview.config.allowImageMode && <small> · enable in Agent settings</small>}</label>
      <label>Privacy on upload<select value={settings.privacy} onChange={(e) => set("privacy", e.target.value as VideoSettings["privacy"])}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
    </div>
  );
}

function Create({ overview, notify, requireAccess, onCreated }: { overview: Overview; notify: Notify; requireAccess: () => boolean; onCreated: (video: AgentVideo) => void }) {
  const [step, setStep] = useState(1);
  const [niche, setNiche] = useState(overview.niches[0]?.id ?? "horror");
  const [subNiche, setSubNiche] = useState("");
  const [idea, setIdea] = useState("");
  const [settings, setSettings] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS);
  const [busy, setBusy] = useState<"plan" | "produce" | null>(null);
  const current = overview.niches.find((item) => item.id === niche);
  useEffect(() => { if (current) setSettings((prev) => ({ ...prev, style: current.defaultStyle })); }, [niche]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(mode: "plan" | "produce") {
    if (!requireAccess()) return;
    setBusy(mode);
    try {
      const data = await apiRequest<{ video: AgentVideo; note: string | null }>("/api/agent/videos", jsonRequest({ niche, subNiche: subNiche || undefined, mode, settings: { ...settings, idea: idea.trim() || undefined } }));
      notify(data.note ?? (mode === "plan" ? "Storyboard ready — review it, then produce." : "Queued. Watch progress on the dashboard."), data.note ? "info" : "success");
      onCreated(data.video);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not create the video.", "error"); }
    finally { setBusy(null); }
  }

  return (
    <div className="ag-card ag-create">
      <ol className="ag-steps">{["Topic", "Format", "Settings", "Review"].map((label, i) => <li key={label} className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""} onClick={() => setStep(i + 1)}><span>{step > i + 1 ? <Check size={12} /> : i + 1}</span>{label}</li>)}</ol>
      {step === 1 && <>
        <h3>Choose a niche</h3>
        <div className="ag-niches">{overview.niches.map((item) => <button key={item.id} className={niche === item.id ? "on" : ""} onClick={() => { setNiche(item.id); setSubNiche(""); }}><span className="ag-emoji">{item.emoji}</span><strong>{item.label}</strong><small>{item.description}</small>{item.audience === "kids" && <em>made for kids</em>}</button>)}</div>
        {current && <label className="ag-field">Sub-niche<select value={subNiche} onChange={(e) => setSubNiche(e.target.value)}><option value="">Let the AI choose</option>{current.subNiches.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        <label className="ag-field">Your idea (optional)<textarea rows={3} maxLength={400} placeholder="Leave empty and the strategist picks an original concept. E.g. “a night-shift guard hears his own voice on the radio”." value={idea} onChange={(e) => setIdea(e.target.value)} /></label>
      </>}
      {step === 2 && <>
        <h3>Format</h3>
        <div className="ag-form-grid">
          <label>Duration<div className="ag-seg">{[15, 30, 45, 60].map((n) => <button key={n} className={settings.targetDuration === n ? "on" : ""} onClick={() => setSettings({ ...settings, targetDuration: n })}>{n}s</button>)}</div></label>
          <label>Visual style<div className="ag-style-grid">{STYLES.map((style) => <button key={style.id} className={settings.style === style.id ? "on" : ""} onClick={() => setSettings({ ...settings, style: style.id })}>{style.label}</button>)}</div></label>
        </div>
        <p className="ag-footnote">Output is always 1080×1920 MP4 (9:16). Length follows the real narration, close to your target.</p>
      </>}
      {step === 3 && <><h3>Voice, captions, audio & provider</h3><SettingsFields settings={settings} setSettings={setSettings} overview={overview} /></>}
      {step === 4 && <>
        <h3>Review</h3>
        <div className="ag-kv"><span>Niche</span><strong>{current?.emoji} {current?.label}{subNiche ? ` · ${current?.subNiches.find((s) => s.id === subNiche)?.label}` : ""}</strong></div>
        <div className="ag-kv"><span>Audience</span><strong>{current?.audience === "kids" ? "Made for kids" : "General (not made for kids)"}</strong></div>
        <div className="ag-kv"><span>Length / style</span><strong>{settings.targetDuration}s · {STYLES.find((s) => s.id === settings.style)?.label}</strong></div>
        <div className="ag-kv"><span>Idea</span><strong>{idea || "AI picks"}</strong></div>
        {!overview.status.providers.some((provider) => provider.configured) && <div className="ag-alert"><Info size={15} /> Video provider not configured. {overview.config.allowImageMode && settings.allowImageMode ? "This will render in IMAGE MODE (not AI video)." : "Add POLLINATIONS_API_KEY (or fal/Replicate) in Settings, or allow IMAGE MODE."}</div>}
        <div className="ag-actions">
          <button className="ag-btn" disabled={busy !== null} onClick={() => void submit("plan")}>{busy === "plan" ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />} Write storyboard first</button>
          <button className="ag-btn primary" disabled={busy !== null} onClick={() => void submit("produce")}>{busy === "produce" ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />} Produce now</button>
        </div>
      </>}
      <div className="ag-nav">{step > 1 && <button className="ag-btn ghost" onClick={() => setStep(step - 1)}>Back</button>}{step < 4 && <button className="ag-btn primary" onClick={() => setStep(step + 1)}>Next <ArrowRight size={15} /></button>}</div>
    </div>
  );
}

function Autopilot({ overview, notify, requireAccess, onStarted }: { overview: Overview; notify: Notify; requireAccess: () => boolean; onStarted: () => void }) {
  const [niche, setNiche] = useState("auto");
  const [count, setCount] = useState(3);
  const [range, setRange] = useState<[number, number]>([30, 45]);
  const [settings, setSettings] = useState<VideoSettings>({ ...DEFAULT_VIDEO_SETTINGS, voiceGender: "female" });
  const [autoPublish, setAutoPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const max = overview.config.maxVideosPerBatch;
  async function start() {
    if (!requireAccess()) return;
    setBusy(true);
    try {
      const result = await apiRequest<{ created: unknown[]; notes: string[]; autoPublish: boolean }>("/api/agent/autopilot", jsonRequest({ niche, count, minDuration: range[0], maxDuration: range[1], settings: { ...settings, autoPublish } }));
      notify(`Autopilot queued ${result.created.length} video(s).${result.notes.length ? ` ${result.notes.join(" ")}` : ""}${result.autoPublish ? " They will auto-publish." : " Each will wait for your review."}`, "success");
      onStarted();
    } catch (error) { notify(error instanceof Error ? error.message : "Autopilot failed to start.", "error"); }
    finally { setBusy(false); }
  }
  return (
    <div className="ag-card ag-create">
      <div className="ag-card-head"><h3><Zap size={16} /> Autopilot batch</h3><span className="ag-footnote">ideas → scripts → storyboards → clips → voice → music/SFX → captions → MP4 → validate → review</span></div>
      <div className="ag-form-grid">
        <label>Niche<select value={niche} onChange={(e) => setNiche(e.target.value)}><option value="auto">Let AI choose (rotates niches)</option>{overview.niches.map((item) => <option key={item.id} value={item.id}>{item.emoji} {item.label}</option>)}</select></label>
        <label>Number of videos<input type="number" min={1} max={max} value={count} onChange={(e) => setCount(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} /><small>max {max} per batch (Agent settings)</small></label>
        <label>Duration range<div className="ag-seg">{([[15, 30], [30, 45], [45, 60]] as [number, number][]).map((pair) => <button key={pair.join()} className={range[0] === pair[0] && range[1] === pair[1] ? "on" : ""} onClick={() => setRange(pair)}>{pair[0]}–{pair[1]}s</button>)}</div></label>
      </div>
      <SettingsFields settings={settings} setSettings={setSettings} overview={overview} />
      <label className="ag-check ag-danger"><input type="checkbox" disabled={!overview.config.autoPublishEnabled} checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} /> <Send size={14} /> Publish automatically after validation {overview.config.autoPublishEnabled ? "" : "(turn on the auto-publish master switch in Agent settings first)"}</label>
      <div className="ag-actions"><button className="ag-btn primary" disabled={busy} onClick={() => void start()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />} Start autopilot</button></div>
    </div>
  );
}

function Library({ videos, filter, setFilter, counts, onOpen }: { videos: AgentVideo[]; filter: "all" | Workflow; setFilter: (value: "all" | Workflow) => void; counts: Overview["counts"]; onOpen: (id: string) => void }) {
  const filters: ("all" | Workflow)[] = ["all", "draft", "processing", "review", "approved", "published", "failed"];
  return (
    <div className="ag-card">
      <div className="ag-filters">{filters.map((item) => <button key={item} className={filter === item ? "on" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All" : WORKFLOW_LABEL[item]} <span>{item === "all" ? counts.total : counts[item]}</span></button>)}</div>
      {videos.length === 0 ? <div className="ag-empty">No videos here yet.</div> : <div className="ag-thumbs lib">{videos.map((video) => <VideoCard key={video.id} video={video} onOpen={() => onOpen(video.id)} />)}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function VideoDetail({ id, notify, onClose, onChanged }: { id: string; notify: Notify; onClose: () => void; onChanged: () => Promise<void> }) {
  const [video, setVideo] = useState<AgentVideo | null>(null);
  const [draft, setDraft] = useState<StoryPlan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"scenes" | "seo" | "log">("scenes");

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<{ video: AgentVideo }>(`/api/agent/videos/${id}`);
      setVideo(data.video);
      setDraft((prev) => (dirty && prev ? prev : data.video.story));
    } catch (error) { notify(error instanceof Error ? error.message : "Could not load the video.", "error"); }
  }, [id, dirty, notify]);
  useEffect(() => { void load(); }, [load]);
  const running = Boolean(video?.job && ["queued", "running", "waiting"].includes(video.job.state));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => { void apiRequest("/api/agent/tick", { method: "POST" }).catch(() => undefined).then(load); }, 4000);
    return () => clearInterval(timer);
  }, [running, load]);

  async function act(action: string, extra: Record<string, unknown> = {}, success?: string) {
    setBusy(action);
    try {
      const data = await apiRequest<{ video: AgentVideo; url?: string }>(`/api/agent/videos/${id}/action`, jsonRequest({ action, ...extra }));
      setVideo(data.video);
      notify(data.url ? `Published: ${data.url}` : success ?? "Done.", "success");
      await onChanged();
    } catch (error) { notify(error instanceof Error ? error.message : "Action failed.", "error"); }
    finally { setBusy(null); }
  }
  async function patch(body: Record<string, unknown>, success: string) {
    setBusy("save");
    try {
      const data = await apiRequest<{ video: AgentVideo; changed: string[] }>(`/api/agent/videos/${id}`, jsonRequest(body, "PATCH"));
      setVideo(data.video); setDraft(data.video.story); setDirty(false);
      notify(data.changed.length ? `${success} ${data.changed.join("; ")}. Press “Produce” to regenerate them.` : success, "success");
      await onChanged();
    } catch (error) { notify(error instanceof Error ? error.message : "Save failed.", "error"); }
    finally { setBusy(null); }
  }
  async function remove() {
    if (!window.confirm("Delete this video, its clips and its job history? This can't be undone.")) return;
    setBusy("delete");
    try { await apiRequest(`/api/agent/videos/${id}`, { method: "DELETE" }); notify("Video deleted.", "success"); onClose(); }
    catch (error) { notify(error instanceof Error ? error.message : "Delete failed.", "error"); setBusy(null); }
  }
  const editScene = (index: number, key: keyof PlanScene, value: string) => {
    if (!draft) return;
    setDirty(true);
    setDraft({ ...draft, scenes: draft.scenes.map((scene) => scene.index === index ? { ...scene, [key]: value } : scene) });
  };
  const editSeo = (key: keyof StoryPlan["seo"], value: string | string[]) => { if (!draft) return; setDirty(true); setDraft({ ...draft, seo: { ...draft.seo, [key]: value } }); };
  const assetsFor = useMemo(() => (index: number) => (video?.assets ?? []).filter((asset) => asset.sceneIndex === index), [video]);

  if (!video) return <div className="ag-modal"><div className="ag-sheet"><div className="ag-empty"><LoaderCircle className="spin" size={20} /> Loading…</div></div></div>;
  const job = video.job;
  return (
    <div className="ag-modal" role="dialog" aria-modal="true">
      <div className="ag-sheet">
        <header className="ag-sheet-head">
          <div><h2>{video.title || "Story pending…"}</h2><div className="ag-vmeta"><Chip workflow={video.workflow} /><ModeBadge video={video} /><span className="ag-muted">{video.niche} · {video.audience === "kids" ? "made for kids" : "not made for kids"} · {video.durationSec ? `${video.durationSec}s` : `${video.settings.targetDuration}s target`}{video.story ? ` · story: ${video.story.source === "ai" ? "AI" : "template writer"}` : ""}</span></div></div>
          <button className="ag-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="ag-sheet-body">
          <aside className="ag-player">
            {video.hasFinal ? <video key={video.updatedAt} controls playsInline preload="metadata" poster={video.hasCover ? fileUrl(video.id, "cover", `&v=${encodeURIComponent(video.updatedAt)}`) : undefined} src={fileUrl(video.id, "final", `&v=${encodeURIComponent(video.updatedAt)}`)} /> : <div className="ag-player-empty"><Clapperboard size={28} /><span>{running ? "Rendering…" : "Not rendered yet"}</span></div>}
            {job && running && <div className="ag-job-inline"><Progress value={job.progress} /><span>{STEP_LABEL[job.step]}{job.currentScene != null ? ` · scene ${job.currentScene + 1}` : ""} · {job.progress}%</span>{job.log.length > 0 && <small>{job.log[job.log.length - 1].message}</small>}</div>}
            {video.error && video.workflow === "failed" && <div className="ag-alert ag-alert-error"><Info size={15} /> {video.error}</div>}
            {video.warnings.length > 0 && <ul className="ag-warnings">{video.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            <div className="ag-actions col">
              {!running && video.workflow !== "published" && <button className="ag-btn primary" disabled={busy !== null} onClick={() => void act("produce", {}, "Production queued.")}><Play size={15} /> {video.hasFinal ? "Produce changes" : "Produce video"}</button>}
              {video.workflow === "failed" && <button className="ag-btn" disabled={busy !== null} onClick={() => void act("retry", {}, "Retrying failed parts only.")}><RefreshCw size={15} /> Retry failed parts</button>}
              {video.workflow === "review" && <button className="ag-btn good" disabled={busy !== null} onClick={() => void patch({ workflow: "approved" }, "Approved.")}><CheckCircle2 size={15} /> Approve</button>}
              {video.workflow === "approved" && <button className="ag-btn good" disabled={busy !== null} onClick={() => void act("publish", {}, "Published.")}>{busy === "publish" ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />} Publish to YouTube</button>}
              {video.workflow === "approved" && <button className="ag-btn ghost" disabled={busy !== null} onClick={() => void patch({ workflow: "review" }, "Moved back to review.")}>Un-approve</button>}
              {video.hasFinal && <a className="ag-btn ghost" href={fileUrl(video.id, "final", "&download=1")}><Save size={15} /> Download MP4</a>}
              {video.hasFinal && !running && <button className="ag-btn ghost" disabled={busy !== null} onClick={() => void act("recompose", {}, "Recomposing (no new AI generations).")}><Captions size={15} /> Re-render captions/audio</button>}
              {!running && video.workflow !== "published" && <button className="ag-btn ghost" disabled={busy !== null} onClick={() => { if (window.confirm("Write a brand-new story? All scenes will be regenerated.")) void act("rewrite-story", {}, "Rewriting story."); }}><WandSparkles size={15} /> Regenerate story</button>}
              {running && <button className="ag-btn ghost" disabled={busy !== null} onClick={() => void act("cancel", {}, "Cancelled.")}><X size={15} /> Cancel job</button>}
              {video.youtubeVideoId && <a className="ag-btn ghost" href={`https://www.youtube.com/watch?v=${video.youtubeVideoId}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open on YouTube</a>}
              <button className="ag-btn danger" disabled={busy !== null || running} onClick={() => void remove()}><Trash2 size={15} /> Delete</button>
            </div>
          </aside>
          <section className="ag-detail">
            <div className="ag-filters">{(["scenes", "seo", "log"] as const).map((item) => <button key={item} className={tab === item ? "on" : ""} onClick={() => setTab(item)}>{item === "scenes" ? "Script & scenes" : item === "seo" ? "Title, description, hashtags" : "Job log"}</button>)}{dirty && <button className="ag-btn primary small" disabled={busy !== null} onClick={() => void patch({ story: draft }, "Saved.")}><Save size={13} /> Save edits</button>}</div>
            {!draft && <div className="ag-empty">{running ? "The story is being written…" : "No story yet — press Produce."}</div>}
            {draft && tab === "scenes" && <>
              <div className="ag-story-meta"><p><strong>Hook:</strong> {draft.hook}</p><p><strong>Concept:</strong> {draft.concept}</p>{draft.characters.length > 0 && <p><strong>Characters:</strong> {draft.characters.map((c) => `${c.name} — ${[c.appearance, c.hair, c.clothing].filter(Boolean).join(", ")}`).join(" | ")}</p>}<p><strong>Music:</strong> {draft.musicMood} · <strong>Tone:</strong> {draft.tone}</p></div>
              {draft.scenes.map((scene) => {
                const assets = assetsFor(scene.index);
                const clip = assets.find((asset) => asset.kind === "clip");
                const voice = assets.find((asset) => asset.kind === "voice");
                return (
                  <div key={scene.index} className="ag-scene">
                    <div className="ag-scene-media">
                      {clip?.status === "done" ? (clip.mode === "image" ? <img src={fileUrl(video.id, "clip", `&scene=${scene.index}&v=${encodeURIComponent(clip.updatedAt)}`)} alt="" /> : <video muted loop playsInline preload="none" onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} src={fileUrl(video.id, "clip", `&scene=${scene.index}&v=${encodeURIComponent(clip.updatedAt)}`)} />) : <div className="ag-scene-ph">{clip?.status === "running" ? <LoaderCircle className="spin" size={18} /> : clip?.status === "failed" ? <Info size={18} /> : <Video size={18} />}<small>{clip?.status ?? "pending"}</small></div>}
                      {clip?.error && clip.status === "failed" && <small className="ag-err">{clip.error}</small>}
                      {voice?.status === "done" && <audio controls preload="none" src={fileUrl(video.id, "voice", `&scene=${scene.index}&v=${encodeURIComponent(voice.updatedAt)}`)} />}
                    </div>
                    <div className="ag-scene-body">
                      <div className="ag-scene-top"><strong>Scene {scene.index + 1}</strong><span className="ag-tag">{scene.beat}</span><span className="ag-tag">{scene.camera}</span>{scene.atmosphere.map((fx) => <span key={fx} className="ag-tag">{fx}</span>)}<span className="ag-muted">{scene.duration}s · {clip?.mode === "image" ? "IMAGE MODE" : clip?.provider ?? ""}</span></div>
                      <label>Narration<textarea rows={2} value={scene.narration} onChange={(e) => editScene(scene.index, "narration", e.target.value)} /></label>
                      <label>Visual<textarea rows={2} value={scene.visual} onChange={(e) => editScene(scene.index, "visual", e.target.value)} /></label>
                      <label>Animation<input value={scene.animation} onChange={(e) => editScene(scene.index, "animation", e.target.value)} /></label>
                      <div className="ag-muted small">SFX: {scene.sfx.join(", ") || "—"} · Transition: {scene.transition}{scene.dialogue.length ? ` · Dialogue: ${scene.dialogue.map((d) => `${d.speaker}: “${d.line}”`).join(" ")}` : ""}</div>
                      {!running && video.workflow !== "published" && <div className="ag-row"><button className="ag-btn small" disabled={busy !== null || dirty} onClick={() => void act("regenerate-scene", { scene: scene.index }, `Regenerating scene ${scene.index + 1}.`)}><RefreshCw size={13} /> Regenerate clip</button><button className="ag-btn small ghost" disabled={busy !== null || dirty} onClick={() => void act("regenerate-scene", { scene: scene.index, voice: true }, `Regenerating scene ${scene.index + 1} + voice.`)}>Clip + voice</button></div>}
                    </div>
                  </div>
                );
              })}
            </>}
            {draft && tab === "seo" && <div className="ag-seo">
              <label>Title<input maxLength={95} value={draft.seo.title} onChange={(e) => editSeo("title", e.target.value)} /><small>{draft.seo.title.length}/95 · “#Shorts” is added on upload</small></label>
              <label>Description<textarea rows={5} value={draft.seo.description} onChange={(e) => editSeo("description", e.target.value)} /></label>
              <label>Hashtags<input value={draft.seo.hashtags.join(" ")} onChange={(e) => editSeo("hashtags", e.target.value.split(/\s+/).filter(Boolean))} /></label>
              <label>Tags<input value={draft.seo.tags.join(", ")} onChange={(e) => editSeo("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} /></label>
              <div className="ag-kv"><span>Category ID</span><strong>{draft.seo.categoryId}</strong></div>
              <div className="ag-kv"><span>Suggested publish time</span><strong>{draft.seo.suggestedPublishTime}</strong></div>
              <div className="ag-kv"><span>Privacy</span><strong>{video.privacy}</strong></div>
              <p className="ag-footnote"><ShieldCheck size={12} /> Fiction is labelled as fiction in the description; uploads include an AI-content note and the YouTube synthetic-media flag.</p>
            </div>}
            {tab === "log" && <div className="ag-log">{(job?.log ?? []).slice().reverse().map((entry, i) => <div key={i} className={`ag-log-${entry.level}`}><time>{when(entry.at)}</time>{entry.message}</div>)}{!job && <div className="ag-empty small">No job yet.</div>}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AgentSettings({ overview, notify, onSaved }: { overview: Overview; notify: Notify; onSaved: () => Promise<void> }) {
  const [config, setConfig] = useState<AgentConfig>(overview.config);
  const [fal, setFal] = useState(JSON.stringify(overview.config.models.fal.extraInput));
  const [rep, setRep] = useState(JSON.stringify(overview.config.models.replicate.extraInput));
  const [busy, setBusy] = useState(false);
  const num = (key: keyof AgentConfig, value: string) => setConfig({ ...config, [key]: Number(value) });
  async function save() {
    setBusy(true);
    try {
      const parse = (text: string) => { const value = JSON.parse(text || "{}"); if (typeof value !== "object" || Array.isArray(value)) throw new Error("Extra input must be a JSON object."); return value; };
      const next = { ...config, models: { ...config.models, fal: { ...config.models.fal, extraInput: parse(fal) }, replicate: { ...config.models.replicate, extraInput: parse(rep) } } };
      const data = await apiRequest<{ config: AgentConfig }>("/api/agent/settings", jsonRequest({ config: next }));
      setConfig(data.config); notify("Agent settings saved.", "success"); await onSaved();
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save.", "error"); }
    finally { setBusy(false); }
  }
  const price = (id: "pollinations" | "fal" | "replicate", value: string) => setConfig({ ...config, pricePerSecond: { ...config.pricePerSecond, [id]: value === "" ? null : Number(value) } });
  return (
    <div className="ag-card ag-create">
      <div className="ag-card-head"><h3><Settings2 size={16} /> Providers</h3><span className="ag-footnote">API keys are stored server-side in the existing Settings → Integrations page. They are never sent to the browser.</span></div>
      <div className="ag-providers">{overview.status.providers.map((provider) => <div key={provider.id} className={`ag-provider ${provider.configured ? "ok" : ""}`}><strong>{provider.label}</strong><span>{provider.configured ? "Configured" : "Not configured"}{provider.paid ? " · paid" : " · free tier / credits"}</span><small>{provider.capabilities.textToVideo ? "text→video" : ""}{provider.capabilities.imageToVideo ? " · image→video" : ""}</small><label>$ per second (optional)<input type="number" step="0.001" min={0} value={config.pricePerSecond[provider.id as "fal"] ?? ""} onChange={(e) => price(provider.id as "fal", e.target.value)} /></label></div>)}</div>
      <div className="ag-form-grid">
        <label>Default provider<select value={config.defaultProvider} onChange={(e) => setConfig({ ...config, defaultProvider: e.target.value as AgentConfig["defaultProvider"] })}><option value="auto">Auto</option><option value="pollinations">Pollinations</option><option value="fal">fal.ai</option><option value="replicate">Replicate</option></select></label>
        <label>Pollinations video model (blank = provider default)<input value={config.models.pollinations.video} onChange={(e) => setConfig({ ...config, models: { ...config.models, pollinations: { ...config.models.pollinations, video: e.target.value } } })} /></label>
        <label>fal text→video model<input value={config.models.fal.textToVideo} onChange={(e) => setConfig({ ...config, models: { ...config.models, fal: { ...config.models.fal, textToVideo: e.target.value } } })} /></label>
        <label>fal image→video model<input value={config.models.fal.imageToVideo} onChange={(e) => setConfig({ ...config, models: { ...config.models, fal: { ...config.models.fal, imageToVideo: e.target.value } } })} /></label>
        <label>fal extra input (JSON)<input value={fal} onChange={(e) => setFal(e.target.value)} /></label>
        <label>Replicate model (owner/name)<input value={config.models.replicate.textToVideo} onChange={(e) => setConfig({ ...config, models: { ...config.models, replicate: { ...config.models.replicate, textToVideo: e.target.value, imageToVideo: e.target.value } } })} /></label>
        <label>Replicate extra input (JSON)<input value={rep} onChange={(e) => setRep(e.target.value)} /></label>
      </div>
      <div className="ag-card-head"><h3><ShieldCheck size={16} /> Cost control</h3></div>
      <div className="ag-form-grid">
        <label>Max videos per batch<input type="number" min={1} max={30} value={config.maxVideosPerBatch} onChange={(e) => num("maxVideosPerBatch", e.target.value)} /></label>
        <label>Max scenes per video<input type="number" min={3} max={12} value={config.maxScenesPerVideo} onChange={(e) => num("maxScenesPerVideo", e.target.value)} /></label>
        <label>Max attempts per scene<input type="number" min={1} max={6} value={config.maxAttemptsPerScene} onChange={(e) => num("maxAttemptsPerScene", e.target.value)} /></label>
        <label>Daily clip limit<input type="number" min={1} max={500} value={config.dailyClipLimit} onChange={(e) => num("dailyClipLimit", e.target.value)} /></label>
        <label>Clip length requested<select value={config.maxClipSeconds} onChange={(e) => num("maxClipSeconds", e.target.value)}><option value={5}>5s (cheaper)</option><option value={10}>10s</option></select></label>
        <label>Timezone (publish-time suggestions)<input value={config.timezone} onChange={(e) => setConfig({ ...config, timezone: e.target.value })} /></label>
      </div>
      <label className="ag-check"><input type="checkbox" checked={config.allowImageMode} onChange={(e) => setConfig({ ...config, allowImageMode: e.target.checked })} /> Allow IMAGE MODE fallback when no video provider is configured (always labelled; never reported as AI video)</label>
      <label className="ag-check ag-danger"><input type="checkbox" checked={config.autoPublishEnabled} onChange={(e) => setConfig({ ...config, autoPublishEnabled: e.target.checked })} /> Auto-publish master switch (off = every video waits in REVIEW for your approval)</label>
      <div className="ag-actions"><button className="ag-btn primary" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Save agent settings</button></div>
    </div>
  );
}
