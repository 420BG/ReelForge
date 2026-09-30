"use client";

import { useEffect, useState } from "react";
import { AudioLines, ExternalLink, Film, Image as ImageIcon, KeyRound, Layers, Loader2, PenLine, Save, Target, Zap } from "lucide-react";
import type { AgentConfig } from "@/content/types";
import { api, post, useAgent, type FreeProvider } from "./data";
import { Button, Chip, NavIcon, Panel, Toggle } from "./ui";

type LegacyProvider = { id: string; kind: "script" | "image" | "voice" | "upload"; name: string; freeLimit: string; getKeyUrl: string | null; envKey: string | null; note: string; configured: boolean; callsToday: number; failuresToday: number; exhausted: boolean };

const SECTIONS = [
  { id: "providers", label: "AI Providers", icon: <Layers className="h-4 w-4" /> },
  { id: "video", label: "Scene Generation", icon: <Film className="h-4 w-4" /> },
  { id: "automation", label: "Automation & limits", icon: <Zap className="h-4 w-4" /> },
  { id: "advanced", label: "Advanced", icon: <Target className="h-4 w-4" /> },
] as const;

const VIDEO_KEYS: Record<string, { env: string; url: string }> = {
  pollinations: { env: "POLLINATIONS_API_KEY", url: "https://enter.pollinations.ai" },
  fal: { env: "FAL_KEY", url: "https://fal.ai/dashboard/keys" },
  replicate: { env: "REPLICATE_API_TOKEN", url: "https://replicate.com/account/api-tokens" },
};

/* Where to get each free key, and which env var it goes in (values never reach the browser). */
const FREE_KEYS: Record<string, { env: string; url: string | null; limit: string }> = {
  groq: { env: "GROQ_API_KEY", url: "https://console.groq.com/keys", limit: "free daily requests" },
  gemini: { env: "GEMINI_API_KEY", url: "https://aistudio.google.com/apikey", limit: "free daily requests" },
  openrouter: { env: "OPENROUTER_API_KEY", url: "https://openrouter.ai/keys", limit: "free :free models" },
  cerebras: { env: "CEREBRAS_API_KEY", url: "https://cloud.cerebras.ai", limit: "~1M tokens/day free" },
  mistral: { env: "MISTRAL_API_KEY", url: "https://console.mistral.ai/api-keys", limit: "free Experiment plan" },
  sambanova: { env: "SAMBANOVA_API_KEY", url: "https://cloud.sambanova.ai/apis", limit: "free tier" },
  "cloudflare-ai": { env: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN", url: "https://dash.cloudflare.com/profile/api-tokens", limit: "10k neurons/day free" },
  "github-models": { env: "GITHUB_MODELS_TOKEN", url: "https://github.com/settings/personal-access-tokens", limit: "free, needs models:read" },
  "pollinations-text": { env: "POLLINATIONS_API_KEY", url: "https://enter.pollinations.ai", limit: "Pollen credits" },
  "pollinations-free-text": { env: "none", url: null, limit: "key-less, last resort" },
  "pollinations-image": { env: "none", url: null, limit: "key-less" },
  "cloudflare-image": { env: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN", url: "https://dash.cloudflare.com/profile/api-tokens", limit: "shares the 10k neurons/day" },
  "huggingface-image": { env: "HF_TOKEN", url: "https://huggingface.co/settings/tokens", limit: "small monthly free credit" },
  "pexels-video": { env: "PEXELS_API_KEY", url: "https://www.pexels.com/api/", limit: "200 req/hour free" },
  "pixabay-video": { env: "PIXABAY_API_KEY", url: "https://pixabay.com/api/docs/", limit: "100 req/min free" },
  free: { env: "none", url: null, limit: "key-less" },
  "cloudflare-tts": { env: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN", url: "https://dash.cloudflare.com/profile/api-tokens", limit: "backup voice" },
  pollinations: { env: "POLLINATIONS_API_KEY", url: "https://enter.pollinations.ai", limit: "Pollen credits" },
  elevenlabs: { env: "ELEVENLABS_API_KEY", url: "https://elevenlabs.io/app/settings/api-keys", limit: "10k chars/month free" },
};

const TEXT_LABELS: Record<string, string> = {
  groq: "Groq", gemini: "Google Gemini", openrouter: "OpenRouter", cerebras: "Cerebras", mistral: "Mistral", sambanova: "SambaNova",
  "cloudflare-ai": "Cloudflare Workers AI", "github-models": "GitHub Models", "pollinations-text": "Pollinations text", "pollinations-free-text": "Pollinations (no key)",
};

function FreeChain({ title, items }: { title: string; items: FreeProvider[] }) {
  if (!items.length) return null;
  const on = items.filter((item) => item.configured).length;
  return (
    <div className="mt-5">
      <p className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-dim"><span>{title}</span><span className="normal-case tracking-normal text-lime">{on}/{items.length} on</span></p>
      <div className="space-y-1.5">
        {items.map((item, i) => {
          const key = FREE_KEYS[item.id];
          return (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2">
              <span className="w-4 text-center text-[10px] font-bold text-dim">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{item.label ?? TEXT_LABELS[item.id] ?? item.id}{item.model && <span className="ml-1 text-[10px] font-normal text-dim">{item.model}</span>}</p>
                <p className="flex flex-wrap items-center gap-1 text-[10px] text-dim">
                  {key?.limit && <span>{key.limit} ·</span>}
                  <KeyRound className="h-2.5 w-2.5" />{key?.env ?? item.env ?? "—"}
                  {!item.configured && key?.url && <a href={key.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-lime">get free key <ExternalLink className="h-2.5 w-2.5" /></a>}
                </p>
              </div>
              <StatusBadge ok={item.configured} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ ok, exhausted, label }: { ok: boolean; exhausted?: boolean; label?: string }) {
  if (exhausted) return <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">Quota used today</span>;
  return ok ? <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[10px] font-bold text-lime">{label ?? "Ready"}</span> : <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-dim">Not configured</span>;
}

export default function Settings() {
  const { overview, notify, refresh } = useAgent();
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("providers");
  const [kind, setKind] = useState<"script" | "image" | "video" | "voice">("script");
  const [legacy, setLegacy] = useState<LegacyProvider[]>([]);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [falExtra, setFalExtra] = useState("{}");
  const [repExtra, setRepExtra] = useState("{}");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void api<{ items: LegacyProvider[] }>("/api/providers").then((d) => setLegacy(d.items)).catch(() => undefined); }, []);
  useEffect(() => {
    if (overview && !config) {
      setConfig(overview.config);
      setFalExtra(JSON.stringify(overview.config.models.fal.extraInput));
      setRepExtra(JSON.stringify(overview.config.models.replicate.extraInput));
    }
  }, [overview, config]);

  async function save() {
    if (!config) return;
    setBusy(true);
    try {
      const parse = (text: string) => { const v = JSON.parse(text || "{}"); if (typeof v !== "object" || Array.isArray(v)) throw new Error("Extra input must be a JSON object."); return v; };
      const next = { ...config, models: { ...config.models, fal: { ...config.models.fal, extraInput: parse(falExtra) }, replicate: { ...config.models.replicate, extraInput: parse(repExtra) } } };
      const data = await api<{ config: AgentConfig }>("/api/agent/settings", post({ config: next }));
      setConfig(data.config); notify("Settings saved."); void refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save.", "error"); }
    finally { setBusy(false); }
  }

  const num = (key: keyof AgentConfig, value: string) => config && setConfig({ ...config, [key]: Number(value) });
  const input = "h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-cream outline-none focus:border-lime/50";

  return (
    <div>
      <h1 className="mb-5 flex items-center gap-2 font-display text-2xl font-bold tracking-tight"><NavIcon name="settings" className="h-5 w-5 text-lime" /> Settings</h1>
      <div className="grid gap-5 md:grid-cols-[210px_1fr]">
        <nav className="flex gap-2 overflow-x-auto md:flex-col">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => setSection(s.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${section === s.id ? "bg-lime/[0.1] text-lime ring-1 ring-lime/30" : "text-mute hover:bg-white/[0.04]"}`}>{s.icon}{s.label}</button>
          ))}
        </nav>

        <Panel>
          {!config ? <div className="flex justify-center py-10 text-dim"><Loader2 className="h-5 w-5 animate-spin" /></div> : <>
            {section === "providers" && (
              <div>
                <h2 className="font-display text-base font-bold">AI Providers</h2>
                <p className="mb-4 text-xs text-dim">Keys live in your Vercel environment variables, never in the browser. Providers rotate automatically when one runs out.</p>
                <div className="mb-4 flex flex-wrap gap-2">
                  <Chip on={kind === "script"} onClick={() => setKind("script")}><PenLine className="mr-1 inline h-3 w-3" />Script</Chip>
                  <Chip on={kind === "image"} onClick={() => setKind("image")}><ImageIcon className="mr-1 inline h-3 w-3" />Images</Chip>
                  <Chip on={kind === "video"} onClick={() => setKind("video")}><Film className="mr-1 inline h-3 w-3" />Video</Chip>
                  <Chip on={kind === "voice"} onClick={() => setKind("voice")}><AudioLines className="mr-1 inline h-3 w-3" />Narration</Chip>
                </div>
                <div className="space-y-2">
                  {kind === "video" ? overview!.status.providers.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{p.label} <span className="text-[11px] font-normal text-dim">{p.paid ? "· paid" : "· free tier / credits"}{p.capabilities.imageToVideo ? " · text & image→video" : " · text→video"}</span></p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-dim"><KeyRound className="h-3 w-3" />{VIDEO_KEYS[p.id]?.env}{VIDEO_KEYS[p.id] && <a href={VIDEO_KEYS[p.id].url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-lime">get key <ExternalLink className="h-2.5 w-2.5" /></a>}</p>
                      </div>
                      <StatusBadge ok={p.configured} />
                    </div>
                  )) : legacy.filter((p) => p.kind === kind).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{p.name}</p>
                        <p className="mt-0.5 text-[11px] text-dim">{p.freeLimit} · used today: {p.callsToday}{p.failuresToday ? ` · failures: ${p.failuresToday}` : ""}{p.envKey ? ` · ${p.envKey}` : " · no key needed"}</p>
                      </div>
                      <StatusBadge ok={p.configured} exhausted={p.exhausted} />
                    </div>
                  ))}
                </div>
                {overview!.status.free && (
                  kind === "script" ? <FreeChain title="Agent story writer — tried in this order" items={overview!.status.free.text} />
                  : kind === "image" ? <FreeChain title="Agent scene images — tried in this order" items={overview!.status.free.images} />
                  : kind === "voice" ? <FreeChain title="Agent narration" items={overview!.status.free.voice} />
                  : <FreeChain title="Free STOCK VIDEO (real footage, not AI)" items={overview!.status.free.stock} />
                )}
                {kind === "video" && !overview!.status.providers.some((p) => p.configured) && (
                  <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-3 text-[11px] text-amber-100">No AI video provider is configured, so real AI video is off. There is no reliable free AI-video API right now — Pollinations video needs Pollen credits, fal and Replicate are pay-per-clip. For free moving visuals, switch on STOCK VIDEO (Pexels/Pixabay footage, labelled as stock) or IMAGE MODE under Scene Generation.</p>
                )}
                <p className="mt-4 text-[11px] text-dim">More keys = more free videos per day: when one provider hits its daily limit the next one takes over automatically. Add keys in Vercel → Settings → Environment Variables, then redeploy.</p>
              </div>
            )}

            {section === "video" && (
              <div className="space-y-4">
                <h2 className="font-display text-base font-bold">Scene generation</h2>
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] px-4 py-3 text-sm">
                  <span>Free STOCK VIDEO fallback<br /><span className="text-[11px] text-dim">Real moving footage from Pexels/Pixabay when no AI video provider works. Labelled “STOCK VIDEO”, credited in the YouTube description, never called AI video. {overview?.status.stockMode?.available ? "" : "Needs PEXELS_API_KEY or PIXABAY_API_KEY."}</span></span>
                  <Toggle on={config.allowStockVideo} onChange={(on) => setConfig({ ...config, allowStockVideo: on })} />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] px-4 py-3 text-sm">
                  <span>Allow IMAGE MODE fallback<br /><span className="text-[11px] text-dim">AI stills + camera motion when no video provider is set (and for scenes stock can't match). Always labelled; never reported as AI video.</span></span>
                  <Toggle on={config.allowImageMode} onChange={(on) => setConfig({ ...config, allowImageMode: on })} />
                </div>
                <label className="block text-xs font-semibold text-mute">Default video provider
                  <select value={config.defaultProvider} onChange={(e) => setConfig({ ...config, defaultProvider: e.target.value as AgentConfig["defaultProvider"] })} className={`${input} mt-1 bg-ink`}>
                    <option value="auto">Auto (first configured)</option><option value="pollinations">Pollinations</option><option value="fal">fal.ai</option><option value="replicate">Replicate</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-mute">Clip length requested
                  <select value={config.maxClipSeconds} onChange={(e) => num("maxClipSeconds", e.target.value)} className={`${input} mt-1 bg-ink`}><option value={5}>5 seconds (cheaper)</option><option value={10}>10 seconds</option></select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-mute">Pollinations video model<input value={config.models.pollinations.video} placeholder="provider default" onChange={(e) => setConfig({ ...config, models: { ...config.models, pollinations: { ...config.models.pollinations, video: e.target.value } } })} className={`${input} mt-1`} /></label>
                  <label className="block text-xs font-semibold text-mute">fal text→video model<input value={config.models.fal.textToVideo} onChange={(e) => setConfig({ ...config, models: { ...config.models, fal: { ...config.models.fal, textToVideo: e.target.value } } })} className={`${input} mt-1`} /></label>
                  <label className="block text-xs font-semibold text-mute">fal image→video model<input value={config.models.fal.imageToVideo} onChange={(e) => setConfig({ ...config, models: { ...config.models, fal: { ...config.models.fal, imageToVideo: e.target.value } } })} className={`${input} mt-1`} /></label>
                  <label className="block text-xs font-semibold text-mute">Replicate model<input value={config.models.replicate.textToVideo} onChange={(e) => setConfig({ ...config, models: { ...config.models, replicate: { ...config.models.replicate, textToVideo: e.target.value, imageToVideo: e.target.value } } })} className={`${input} mt-1`} /></label>
                </div>
              </div>
            )}

            {section === "automation" && (
              <div className="space-y-4">
                <h2 className="font-display text-base font-bold">Automation & cost limits</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-mute">Max videos per batch<input type="number" min={1} max={30} value={config.maxVideosPerBatch} onChange={(e) => num("maxVideosPerBatch", e.target.value)} className={`${input} mt-1`} /></label>
                  <label className="block text-xs font-semibold text-mute">Max scenes per video<input type="number" min={3} max={12} value={config.maxScenesPerVideo} onChange={(e) => num("maxScenesPerVideo", e.target.value)} className={`${input} mt-1`} /></label>
                  <label className="block text-xs font-semibold text-mute">Max attempts per scene<input type="number" min={1} max={6} value={config.maxAttemptsPerScene} onChange={(e) => num("maxAttemptsPerScene", e.target.value)} className={`${input} mt-1`} /></label>
                  <label className="block text-xs font-semibold text-mute">Daily clip limit<input type="number" min={1} max={500} value={config.dailyClipLimit} onChange={(e) => num("dailyClipLimit", e.target.value)} className={`${input} mt-1`} /></label>
                </div>
                <p className="text-[11px] text-dim">Used today: {overview?.usage.clips ?? 0} clips{overview && overview.usage.cost > 0 ? ` · ~$${overview.usage.cost.toFixed(2)}` : ""}.</p>
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-300/20 px-4 py-3 text-sm">
                  <span>Auto-publish master switch<br /><span className="text-[11px] text-dim">Off = every video waits in review for your approval.</span></span>
                  <Toggle on={config.autoPublishEnabled} onChange={(on) => setConfig({ ...config, autoPublishEnabled: on })} />
                </div>
              </div>
            )}

            {section === "advanced" && (
              <div className="space-y-3">
                <h2 className="font-display text-base font-bold">Advanced</h2>
                <label className="block text-xs font-semibold text-mute">Timezone (publish-time suggestions)<input value={config.timezone} onChange={(e) => setConfig({ ...config, timezone: e.target.value })} className={`${input} mt-1`} /></label>
                <label className="block text-xs font-semibold text-mute">fal extra input (JSON)<input value={falExtra} onChange={(e) => setFalExtra(e.target.value)} className={`${input} mt-1 font-mono`} /></label>
                <label className="block text-xs font-semibold text-mute">Replicate extra input (JSON)<input value={repExtra} onChange={(e) => setRepExtra(e.target.value)} className={`${input} mt-1 font-mono`} /></label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["pollinations", "fal", "replicate"] as const).map((id) => (
                    <label key={id} className="block text-xs font-semibold text-mute">{id} $/second<input type="number" step="0.001" min={0} value={config.pricePerSecond[id] ?? ""} placeholder="unknown" onChange={(e) => setConfig({ ...config, pricePerSecond: { ...config.pricePerSecond, [id]: e.target.value === "" ? null : Number(e.target.value) } })} className={`${input} mt-1`} /></label>
                  ))}
                </div>
                <p className="text-[11px] text-dim">Renderer: {overview?.status.ffmpeg ? "ffmpeg ready" : "ffmpeg missing"} · Story model: {overview?.status.textModel ? "configured" : "template writer only"}</p>
              </div>
            )}

            {section !== "providers" && <div className="mt-5 flex justify-end"><Button onClick={() => void save()} busy={busy}><Save className="h-4 w-4" /> Save settings</Button></div>}
          </>}
        </Panel>
      </div>
    </div>
  );
}
