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
  luma: { env: "LUMAAI_API_KEY", url: "https://lumalabs.ai/dream-machine/api/keys" },
  runway: { env: "RUNWAYML_API_SECRET", url: "https://dev.runwayml.com" },
};

/* Where to get each free key, and which env var it goes in (values never reach the browser). */
/* Where to get each key and which env var it goes in (values never reach the browser).
   Limits are set by each provider and change often, so no numbers are claimed here. */
const FREE_KEYS: Record<string, { env: string; url: string | null; tier: "FREE" | "FREE TIER" }> = {
  groq: { env: "GROQ_API_KEY", url: "https://console.groq.com/keys", tier: "FREE TIER" },
  gemini: { env: "GEMINI_API_KEY", url: "https://aistudio.google.com/apikey", tier: "FREE TIER" },
  openrouter: { env: "OPENROUTER_API_KEY", url: "https://openrouter.ai/keys", tier: "FREE TIER" },
  cerebras: { env: "CEREBRAS_API_KEY", url: "https://cloud.cerebras.ai", tier: "FREE TIER" },
  mistral: { env: "MISTRAL_API_KEY", url: "https://console.mistral.ai/api-keys", tier: "FREE TIER" },
  sambanova: { env: "SAMBANOVA_API_KEY", url: "https://cloud.sambanova.ai/apis", tier: "FREE TIER" },
  "cloudflare-ai": { env: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN", url: "https://dash.cloudflare.com/profile/api-tokens", tier: "FREE TIER" },
  "github-models": { env: "GITHUB_MODELS_TOKEN", url: "https://github.com/settings/personal-access-tokens", tier: "FREE TIER" },
  nvidia: { env: "NVIDIA_API_KEY", url: "https://build.nvidia.com", tier: "FREE TIER" },
  huggingface: { env: "HF_TOKEN", url: "https://huggingface.co/settings/tokens", tier: "FREE TIER" },
  cohere: { env: "COHERE_API_KEY", url: "https://dashboard.cohere.com/api-keys", tier: "FREE TIER" },
  "pollinations-text": { env: "POLLINATIONS_API_KEY", url: "https://enter.pollinations.ai", tier: "FREE TIER" },
  "pollinations-free-text": { env: "none", url: null, tier: "FREE" },
  "pollinations-image": { env: "none (POLLINATIONS_API_KEY optional)", url: null, tier: "FREE" },
  "gemini-image": { env: "GEMINI_API_KEY", url: "https://aistudio.google.com/apikey", tier: "FREE TIER" },
  "cloudflare-image": { env: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN", url: "https://dash.cloudflare.com/profile/api-tokens", tier: "FREE TIER" },
  "huggingface-image": { env: "HF_TOKEN", url: "https://huggingface.co/settings/tokens", tier: "FREE TIER" },
  "ai-horde": { env: "none (AI_HORDE_API_KEY optional)", url: "https://aihorde.net/register", tier: "FREE" },
  "pexels-video": { env: "PEXELS_API_KEY", url: "https://www.pexels.com/api/", tier: "FREE" },
  "pixabay-video": { env: "PIXABAY_API_KEY", url: "https://pixabay.com/api/docs/", tier: "FREE" },
  free: { env: "none", url: null, tier: "FREE" },
  deepgram: { env: "DEEPGRAM_API_KEY", url: "https://console.deepgram.com/signup", tier: "FREE TIER" },
  "cloudflare-tts": { env: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN", url: "https://dash.cloudflare.com/profile/api-tokens", tier: "FREE TIER" },
  pollinations: { env: "POLLINATIONS_API_KEY", url: "https://enter.pollinations.ai", tier: "FREE TIER" },
  elevenlabs: { env: "ELEVENLABS_API_KEY", url: "https://elevenlabs.io/app/settings/api-keys", tier: "FREE TIER" },
};

const TEXT_LABELS: Record<string, string> = {
  groq: "Groq", gemini: "Google Gemini", openrouter: "OpenRouter", cerebras: "Cerebras", mistral: "Mistral", sambanova: "SambaNova",
  "cloudflare-ai": "Cloudflare Workers AI", "github-models": "GitHub Models", nvidia: "NVIDIA NIM", huggingface: "Hugging Face router", cohere: "Cohere", "pollinations-text": "Pollinations text", "pollinations-free-text": "Pollinations (no key)",
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
              <TierBadge tier={key?.tier ?? "FREE TIER"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{item.label ?? TEXT_LABELS[item.id] ?? item.id}{item.model && <span className="ml-1 text-[10px] font-normal text-dim">{item.model}</span>}</p>
                <p className="flex flex-wrap items-center gap-1 text-[10px] text-dim">
                  {item.health && <span className={item.health.exhausted ? "font-bold text-amber-200" : ""}>{item.health.exhausted ? "out of quota today · " : ""}used today {item.health.calls}{item.health.failures ? ` · ${item.health.failures} failed` : ""} ·</span>}
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

function TierBadge({ tier }: { tier: "FREE" | "FREE TIER" | "PAID" }) {
  const cls = tier === "PAID" ? "bg-amber-300/20 text-amber-200" : tier === "FREE" ? "bg-emerald-400/15 text-emerald-300" : "bg-lime/15 text-lime";
  return <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black tracking-wide ${cls}`}>{tier}</span>;
}

const ACCESS_LABEL: Record<string, { text: string; cls: string }> = {
  ready: { text: "Ready", cls: "bg-lime/15 text-lime" },
  enabled: { text: "Enabled", cls: "bg-amber-300/20 text-amber-200" },
  "not-configured": { text: "Not configured", cls: "bg-white/[0.06] text-dim" },
  disabled: { text: "Disabled", cls: "bg-white/[0.06] text-dim" },
  "blocked-free-mode": { text: "Disabled · Free Mode", cls: "bg-white/[0.06] text-dim" },
};

/** Confirmation required before anything that can cost money (also enforced by the server). */
function PaidDialog({ open, label, freeMode, onCancel, onConfirm, busy }: { open: boolean; label: string; freeMode: boolean; onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="paid-title">
      <div className="glass-deep w-full max-w-sm rounded-3xl border border-amber-300/30 p-5">
        <p id="paid-title" className="flex items-center gap-2 font-display text-lg font-bold"><span className="rounded-md bg-amber-300/20 px-1.5 py-0.5 text-[10px] font-black text-amber-200">PAID</span> Paid AI Provider</p>
        <p className="mt-3 text-sm leading-relaxed text-mute">This provider may incur API charges.{label ? <> (<b className="text-cream">{label}</b>)</> : null} {freeMode ? "Free Mode is currently enabled — continuing turns Free Mode OFF." : ""}</p>
        <p className="mt-2 text-[11px] text-dim">You can switch it off again at any time. The daily clip limit in Automation still applies.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" busy={busy} onClick={onConfirm}>Enable Paid Provider</Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ ok, exhausted, label }: { ok: boolean; exhausted?: boolean; label?: string }) {
  if (exhausted) return <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">Quota used today</span>;
  return ok ? <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[10px] font-bold text-lime">{label ?? "Ready"}</span> : <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-dim">Not configured</span>;
}

export default function Settings() {
  const { overview, error, notify, refresh } = useAgent();
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("providers");
  const [kind, setKind] = useState<"script" | "image" | "video" | "voice">("script");
  const [legacy, setLegacy] = useState<LegacyProvider[]>([]);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [falExtra, setFalExtra] = useState("{}");
  const [repExtra, setRepExtra] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [paidDialog, setPaidDialog] = useState<{ provider: string | null; label: string } | null>(null);
  const [savingSafety, setSavingSafety] = useState(false);

  /** Free Mode / provider switches save immediately; the server rejects paid changes without confirmPaid. */
  async function saveSafety(patch: Partial<AgentConfig>, confirmPaid = false) {
    setSavingSafety(true);
    try {
      const data = await api<{ config: AgentConfig }>("/api/agent/settings", post({ config: patch, confirmPaid }));
      setConfig((prev) => (prev ? { ...prev, freeMode: data.config.freeMode, providers: data.config.providers, allowStockVideo: data.config.allowStockVideo } : data.config));
      void refresh();
      return true;
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save.", "error"); return false; }
    finally { setSavingSafety(false); }
  }

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
          {!config ? (
            error
              ? <div className="py-8 text-center text-sm">
                  <p className="font-bold text-red-300">Couldn&apos;t load settings</p>
                  <p className="mx-auto mt-1 max-w-md break-words text-[11px] text-dim">{/max clients|EMAXCONN|too many clients/i.test(error) ? "The database is busy (connection limit reached). It usually clears in a few seconds." : error}</p>
                  <Button variant="outline" onClick={() => void refresh()} className="mt-4 h-9 text-xs">Retry</Button>
                </div>
              : <div className="flex justify-center py-10 text-dim"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : <>
            {section === "providers" && (() => {
              const fu = overview!.status.freeUsage;
              const paid = overview!.status.providers.filter((p) => p.paid);
              const freeVideo = overview!.status.providers.filter((p) => !p.paid);
              return (
              <div className="space-y-5">
                {/* FREE MODE */}
                <div className={`rounded-2xl border px-4 py-4 ${config.freeMode ? "border-emerald-400/30 bg-emerald-400/[0.05]" : "border-amber-300/30 bg-amber-300/[0.05]"}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-display text-base font-bold">{config.freeMode ? "🟢" : "🟡"} Free Mode {config.freeMode ? "ON" : "OFF"}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-mute">When Free Mode is ON, ReelForge will never automatically use paid AI providers.</p>
                    </div>
                    <Toggle on={config.freeMode} label="Free Mode" onChange={(on) => { if (on) void saveSafety({ freeMode: true }); else setPaidDialog({ provider: null, label: "" }); }} />
                  </div>
                </div>

                {/* FREE DAILY USAGE */}
                {fu && (
                  <div className="rounded-2xl border border-white/[0.07] px-4 py-4">
                    <p className="font-display text-sm font-bold">Free daily usage <span className="text-[11px] font-normal text-dim">· target 1 Short + 1 Long</span></p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["Shorts today", `${fu.videos.short.started} started · ${fu.videos.short.finished} done`, `${fu.remaining.short} remaining`],
                        ["Longs today", `${fu.videos.long.started} started · ${fu.videos.long.finished} done`, `${fu.remaining.long} remaining`],
                        ["Free AI generations today", String(fu.aiCallsToday), "story, images, voice, video"],
                        ["Paid AI calls today", String(fu.paidCallsToday), config.freeMode ? "blocked by Free Mode" : "paid providers allowed"],
                      ].map(([k, v, hint]) => <div key={k} className="rounded-xl bg-white/[0.03] px-3 py-2"><p className="text-[10px] text-dim">{k}</p><p className="text-sm font-bold">{v}</p><p className="text-[10px] text-dim">{hint}</p></div>)}
                    </div>
                    {fu.outOfQuota.length > 0 && <p className="mt-2 text-[11px] text-amber-200">Out of free quota today: {fu.outOfQuota.join(", ")} — the next free provider is used automatically.</p>}
                    <p className="mt-2 text-[11px] text-dim">{fu.note} “Remaining” counts against your 1 + 1 daily target, not provider quotas.</p>
                  </div>
                )}

                {/* FREE AI PROVIDERS */}
                <div>
                  <p className="mb-2 font-display text-sm font-bold">🟢 Free AI providers <span className="text-[11px] font-normal text-dim">· free / free tier, tried in order</span></p>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Chip on={kind === "script"} onClick={() => setKind("script")}><PenLine className="mr-1 inline h-3 w-3" />Story / script</Chip>
                    <Chip on={kind === "image"} onClick={() => setKind("image")}><ImageIcon className="mr-1 inline h-3 w-3" />Image generation</Chip>
                    <Chip on={kind === "voice"} onClick={() => setKind("voice")}><AudioLines className="mr-1 inline h-3 w-3" />Narration</Chip>
                    <Chip on={kind === "video"} onClick={() => setKind("video")}><Film className="mr-1 inline h-3 w-3" />Image → video</Chip>
                  </div>
                  {overview!.status.free && kind !== "video" && (
                    <FreeChain title={kind === "script" ? "story & script writing" : kind === "image" ? "one AI image per scene" : "narration"} items={kind === "script" ? overview!.status.free.text : kind === "image" ? overview!.status.free.images : overview!.status.free.voice} />
                  )}
                  {kind === "video" && (
                    <div className="mt-2 space-y-1.5">
                      {freeVideo.map((p) => {
                        const st = p.health?.exhausted ? { text: "Out of quota today", cls: "bg-amber-300/15 text-amber-200" } : (ACCESS_LABEL[p.status ?? "disabled"] ?? ACCESS_LABEL.disabled);
                        return (
                          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2">
                            <TierBadge tier="FREE TIER" />
                            <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{p.label} <span className="text-[10px] font-normal text-dim">· {p.capabilities.imageToVideo ? "image → video" : "text → video"}{p.health ? ` · ${p.health.calls} clips today` : ""}</span></p><p className="text-[10px] text-dim">{VIDEO_KEYS[p.id]?.env} · uses credits on your account when available; otherwise scenes use free camera motion</p></div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.text}</span>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2"><TierBadge tier="FREE" /><p className="flex-1 text-[13px] font-semibold">Camera motion on the AI image <span className="text-[10px] font-normal text-dim">· zoom / pan / weather FX, built in</span></p><span className="rounded-full bg-lime/15 px-2 py-0.5 text-[10px] font-bold text-lime">Ready</span></div>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-dim">More free keys = more videos per day. When one provider hits its limit, the next free one takes over — never a paid one.</p>
                </div>

                {/* PAID AI PROVIDERS */}
                <div className={config.freeMode ? "opacity-70" : ""}>
                  <p className="mb-2 font-display text-sm font-bold">🟡 Paid AI providers <span className="text-[11px] font-normal text-dim">· optional, OFF by default</span></p>
                  <div className="space-y-1.5">
                    {paid.map((p) => {
                      const st = ACCESS_LABEL[p.status ?? "disabled"] ?? ACCESS_LABEL.disabled;
                      return (
                        <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                          <TierBadge tier="PAID" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold">{p.label} <span className="text-[10px] font-normal text-dim">· {p.capabilities.imageToVideo ? "image → video" : "text → video"}</span></p>
                            <p className="flex flex-wrap items-center gap-1 text-[10px] text-dim"><KeyRound className="h-2.5 w-2.5" />{VIDEO_KEYS[p.id]?.env}{p.configured ? " · key set" : " · no key"}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.text}</span>
                          <Toggle on={Boolean(p.enabled) && !config.freeMode} label={`${p.label} enabled`} onChange={(on) => {
                            if (on) setPaidDialog({ provider: p.id, label: p.label });
                            else void saveSafety({ providers: { ...config.providers, [p.id]: { enabled: false } } });
                          }} />
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-dim">A paid provider runs only when Free Mode is OFF <b>and</b> its switch is ON. Having an API key is never enough, and a paid provider is never used as an automatic fallback. Kling, Hailuo, Wan and Pika models are reached through fal.ai / Replicate.</p>
                </div>

                {/* FREE STOCK VIDEO */}
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] px-4 py-3 text-sm">
                  <span><span className="mr-1 inline-block"><TierBadge tier="FREE" /></span> Free stock video <span className="text-[11px] text-dim">· optional fallback</span><br /><span className="text-[11px] text-dim">Only when every AI image provider fails for a scene (Pexels/Pixabay, labelled “STOCK” and credited). Never the main visual. {overview?.status.stockMode?.available ? "" : "Needs PEXELS_API_KEY or PIXABAY_API_KEY."}</span></span>
                  <Toggle on={config.allowStockVideo} label="Stock video fallback" onChange={(on) => { setConfig({ ...config, allowStockVideo: on }); void saveSafety({ allowStockVideo: on }); }} />
                </div>

                <details className="rounded-2xl border border-white/[0.06] px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-mute">Classic studio providers</summary>
                  <div className="mt-2 space-y-1.5">
                    {legacy.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 text-[12px]"><span className="flex-1">{p.name} <span className="text-dim">· used today {p.callsToday}{p.envKey ? ` · ${p.envKey}` : " · no key"}</span></span><StatusBadge ok={p.configured} exhausted={p.exhausted} /></div>
                    ))}
                  </div>
                </details>

                <PaidDialog open={Boolean(paidDialog)} label={paidDialog?.label ?? ""} freeMode={config.freeMode} busy={savingSafety}
                  onCancel={() => setPaidDialog(null)}
                  onConfirm={async () => {
                    const target = paidDialog;
                    const patch: Partial<AgentConfig> = { freeMode: false };
                    if (target?.provider) patch.providers = { ...config.providers, [target.provider]: { enabled: true } };
                    if (await saveSafety(patch, true)) { notify(target?.provider ? `${target.label} enabled — it may incur charges.` : "Free Mode is OFF. Enable individual paid providers below."); setPaidDialog(null); }
                  }} />
              </div>
              );
            })()}

            {section === "video" && (
              <div className="space-y-4">
                <h2 className="font-display text-base font-bold">Scene generation</h2>
                <p className="rounded-2xl border border-lime/20 bg-lime/[0.04] px-4 py-3 text-[11px] leading-relaxed text-mute"><b className="text-cream">How each scene is made:</b> AI image (free providers, first with quota wins) → AI image-to-video when a free-tier provider (or a paid one you enabled) is available → otherwise free camera motion (zoom/pan + weather FX) on the AI image. Every result is saved, so a provider running out only pauses and resumes. Free Mode and paid providers are under AI Providers.</p>
                <div className="rounded-2xl border border-white/[0.07] px-4 py-3 text-sm">
                  <span>AI image-to-video for</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">{([["all", "Every scene"], ["hook", "Hook scene only (saves quota)"], ["none", "None — camera motion only"]] as const).map(([id, label]) => <Chip key={id} on={config.aiVideoScenes === id} onClick={() => setConfig({ ...config, aiVideoScenes: id })}>{label}</Chip>)}</div>
                </div>
                <label className="block text-xs font-semibold text-mute">Default video provider
                  <select value={config.defaultProvider} onChange={(e) => setConfig({ ...config, defaultProvider: e.target.value as AgentConfig["defaultProvider"] })} className={`${input} mt-1 bg-ink`}>
                    <option value="auto">Auto (free first; paid only if you enabled it)</option><option value="pollinations">Pollinations</option><option value="fal">fal.ai</option><option value="replicate">Replicate</option><option value="luma">Luma</option><option value="runway">Runway</option>
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
                <div className="rounded-2xl border border-lime/25 px-4 py-3 text-sm">
                  <p className="font-bold">Daily production</p>
                  <p className="mb-3 text-[11px] text-dim">Makes one Short and/or one Long every day at these times ({config.timezone}). Each waits for your review unless the auto-publish master switch is on.</p>
                  <div className="space-y-2">
                    {([["short", "Daily Short (9:16)", "shortTime"], ["long", "Daily Long (16:9)", "longTime"]] as const).map(([id, label, timeKey]) => (
                      <div key={id} className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2"><Toggle on={config.daily[id]} onChange={(on) => setConfig({ ...config, daily: { ...config.daily, [id]: on } })} label={label} /> {label}</label>
                        <input type="time" value={config.daily[timeKey]} onChange={(e) => setConfig({ ...config, daily: { ...config.daily, [timeKey]: e.target.value } })} className="h-9 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-sm text-cream outline-none" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-mute">Niche
                      <select value={config.daily.niche} onChange={(e) => setConfig({ ...config, daily: { ...config.daily, niche: e.target.value } })} className={`${input} mt-1 bg-ink`}>
                        <option value="auto">Rotate niches daily</option>
                        {(overview?.niches ?? []).map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.label}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-mute">Long video length (minutes)<input type="number" min={2} max={15} value={config.daily.longMinutes} onChange={(e) => setConfig({ ...config, daily: { ...config.daily, longMinutes: Number(e.target.value) || 5 } })} className={`${input} mt-1`} /></label>
                  </div>
                  <p className={`mt-3 text-[11px] ${overview?.status.daily?.background ? "text-lime" : "text-amber-200"}`}>{overview?.status.daily?.background ? "Background generation is on (CRON_SECRET set): videos keep rendering with the app closed." : "Add a CRON_SECRET environment variable in Vercel so videos keep rendering with the app closed. For reliable daily timing, also point a free scheduler (e.g. cron-job.org) at /api/cron every 15 min with header x-cron-secret."}</p>
                </div>
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
