"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, LoaderCircle, RefreshCw, Save, ShieldCheck, Sparkles, Trash2, Zap } from "lucide-react";
import { apiRequest, jsonRequest } from "@/lib/client-api";
import type { AutoSettings } from "@/lib/types";

type SecretRow = { name: string; configured: boolean; masked: string };

type Props = {
  notify: (message: string, kind?: "success" | "error" | "info") => void;
  refreshConfig: () => Promise<void>;
};

const FIELDS: { name: string; label: string; help: string; url: string }[] = [
  { name: "OPENROUTER_API_KEY", label: "OpenRouter key", help: "AI story writing + smarter chat (free router)", url: "https://openrouter.ai/keys" },
  { name: "POLLINATIONS_API_KEY", label: "Pollinations key", help: "In-app AI video clips, art & Kokoro voices", url: "https://enter.pollinations.ai/keys" },
  { name: "PEXELS_API_KEY", label: "Pexels key", help: "Free licensed stock video browsing", url: "https://www.pexels.com/api/" },
  { name: "PIXABAY_API_KEY", label: "Pixabay key", help: "Second free stock video source", url: "https://pixabay.com/service/about/api/" },
  { name: "ELEVENLABS_API_KEY", label: "ElevenLabs key", help: "Lifelike narration (commercial rights: check plan)", url: "https://elevenlabs.io/app/settings/api-keys" },
  { name: "FAL_KEY", label: "fal.ai key (optional, paid)", help: "Shorts Agent video provider — Kling/Veo/LTX/Wan via one key", url: "https://fal.ai/dashboard/keys" },
  { name: "REPLICATE_API_TOKEN", label: "Replicate token (optional, paid)", help: "Shorts Agent video provider — alternative model host", url: "https://replicate.com/account/api-tokens" },
  { name: "GOOGLE_CLIENT_ID", label: "Google OAuth Client ID", help: "YouTube upload — Web application client", url: "https://console.cloud.google.com/apis/credentials" },
  { name: "GOOGLE_CLIENT_SECRET", label: "Google OAuth Client Secret", help: "YouTube upload — pair with Client ID above", url: "https://console.cloud.google.com/apis/credentials" },
];

export default function SettingsIntegrations({ notify, refreshConfig }: Props) {
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState<AutoSettings>({ enabled: false, autoPost: false, visibility: "private", lastRunDate: null });
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [origin, setOrigin] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiRequest<{ secrets: SecretRow[]; auto: AutoSettings; youtubeConnected: boolean }>("/api/keys");
      setSecrets(data.secrets);
      setAuto(data.auto);
      setYoutubeConnected(data.youtubeConnected);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load settings.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(extra?: { clears?: string[]; auto?: AutoSettings }) {
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      for (const [name, value] of Object.entries(drafts)) if (value.trim()) updates[name] = value.trim();
      const payload: Record<string, unknown> = { updates, clears: extra?.clears || [], auto: extra?.auto || auto };
      const data = await apiRequest<{ secrets: SecretRow[]; auto: AutoSettings }>("/api/keys", jsonRequest(payload));
      setSecrets(data.secrets);
      setAuto(data.auto);
      setDrafts({});
      await refreshConfig();
      notify("Settings saved. New keys work immediately.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save settings.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeKey(name: string) {
    await save({ clears: [name] });
    notify(`${name} removed.`, "success");
  }

  const statusFor = (name: string) => secrets.find((row) => row.name === name);

  return (
    <>
      <section className="settings-card panel keys-card">
        <div className="settings-card-icon settings-mint"><KeyIcon /></div>
        <div className="settings-card-content">
          <div className="settings-title-row"><h2>Paste your API keys here</h2><span className={`connection-badge ${secrets.filter((row) => row.configured).length ? "connected" : "not-connected"}`}>{secrets.filter((row) => row.configured).length} connected</span></div>
          <p>Copy a free key from its website, paste it below, and hit save — it&apos;s stored securely on this server and activates instantly. No `.env` editing needed. Values are never shown back to you, only masked.</p>

          {loading ? <div className="key-grid-loading"><LoaderCircle size={16} className="spin" /> Loading status…</div> : <div className="key-grid">
            {FIELDS.map((field) => {
              const status = statusFor(field.name);
              return <div className="key-row" key={field.name}>
                <div className="key-row-head">
                  <label htmlFor={field.name}>{field.label}</label>
                  {status?.configured ? <span className="key-status on"><Check size={11} /> {status.masked}</span> : <span className="key-status">not set</span>}
                </div>
                <div className="key-row-input">
                  <input id={field.name} type="password" autoComplete="off" spellCheck={false} placeholder={status?.configured ? "Leave blank to keep current key" : `Paste ${field.label.toLowerCase()}`}
                    value={drafts[field.name] || ""} onChange={(event) => setDrafts((current) => ({ ...current, [field.name]: event.target.value }))} />
                  <a href={field.url} target="_blank" rel="noopener noreferrer" title={`Get a free key — ${field.help}`}><ExternalLink size={14} /></a>
                  {status?.configured && <button className="key-remove" title="Remove this key" onClick={() => void removeKey(field.name)}><Trash2 size={13} /></button>}
                </div>
                <small>{field.help}</small>
              </div>;
            })}
          </div>}

          <div className="key-save-row">
            <button className="button button-primary" onClick={() => void save()} disabled={saving || !Object.values(drafts).some((value) => value.trim())}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Save keys</button>
            <span className="key-origin-note"><ShieldCheck size={14} /> Stored server-side · masked in the browser</span>
          </div>
          <div className="env-instruction"><span>IF YOU PREFER FILES</span><code>same names in your .env / deployment secrets still work as fallback</code></div>
          <div className="env-instruction"><span>YOUTUBE REDIRECT URI</span><code>{origin ? `${origin}/api/youtube/callback` : "/api/youtube/callback"}</code></div>
        </div>
      </section>

      <section className="settings-card panel autopilot-card">
        <div className="settings-card-icon settings-peach"><Zap size={21} /></div>
        <div className="settings-card-content">
          <div className="settings-title-row"><h2>Daily autopilot</h2><span className={`connection-badge ${auto.enabled ? "connected" : "not-connected"}`}>{auto.enabled ? `Runs daily${auto.lastRunDate ? ` · last ${auto.lastRunDate}` : ""}` : "Off"}</span></div>
          <p>Let the studio think for itself: once per day it picks (or writes with your OpenRouter key) a kid-safe topic, gathers licensed clips when stock keys exist, builds the full Short with captions and music, and — while this app is open — renders it. Turn on auto-post and it uploads to your channel by itself.</p>

          <label className="autopilot-toggle">
            <input type="checkbox" checked={auto.enabled} onChange={(event) => setAuto((current) => ({ ...current, enabled: event.target.checked }))} />
            <span className="autopilot-track"><i /></span>
            <span><strong>Generate a new Short every day</strong><small>Runs once per day when you open the studio</small></span>
          </label>

          <label className="autopilot-toggle">
            <input type="checkbox" checked={auto.autoPost} onChange={(event) => setAuto((current) => ({ ...current, autoPost: event.target.checked }))} />
            <span className="autopilot-track"><i /></span>
            <span><strong>Auto-post to YouTube after rendering</strong><small>{youtubeConnected ? "Channel connected — no confirmation dialog" : "Requires YouTube connected below"}</small></span>
          </label>

          <label className="field-label autopilot-visibility">Daily post visibility
            <select className="field-input field-select" value={auto.visibility} onChange={(event) => setAuto((current) => ({ ...current, visibility: event.target.value as AutoSettings["visibility"] }))}>
              <option value="private">Private — safest while testing</option>
              <option value="unlisted">Unlisted — share by link</option>
              <option value="public">Public — visible to everyone</option>
            </select>
          </label>

          <div className="autopilot-consent"><Sparkles size={15} /><span>Autopilot always marks uploads <strong>made for kids</strong>, credits sources, and never uses anyone else&apos;s videos. You can review past runs in Publish queue. Rendering happens in your open browser tab, so keep the studio open for the daily finish.</span></div>

          <div className="key-save-row"><button className="button button-primary" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Save autopilot</button><button className="button button-light" onClick={() => void load()}><RefreshCw size={14} /> Reload status</button></div>
        </div>
      </section>
    </>
  );
}

function KeyIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}
