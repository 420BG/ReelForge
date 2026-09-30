"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight, BadgeCheck, CalendarClock, Check, ClipboardCopy, Download, ExternalLink,
  Film, LoaderCircle, Lock, Play, Search, ShieldCheck, Sparkles, Video, WandSparkles, Zap,
} from "lucide-react";
import { AI_VIDEO_PROVIDERS, childSafeVideoPrompt, getDailyTopic, mediaToProxyUrl } from "@/lib/discovery";
import { apiRequest, jsonRequest } from "@/lib/client-api";
import type { MediaAsset, StudioConfig, StudioProject } from "@/lib/types";

type Props = {
  config: StudioConfig;
  requireAccess: () => boolean;
  notify: (message: string, kind?: "success" | "error" | "info") => void;
  onProjectCreated: (project: StudioProject) => void;
};

type HubTab = "daily" | "stock" | "ai";

const KID_QUERIES = [
  "baby animals meadow",
  "underwater fish turtle",
  "butterfly garden flowers",
  "stars night sky",
  "happy dog puppy",
  "forest animals",
];

const stockConfigured = (config: StudioConfig, source: "pexels" | "pixabay") =>
  source === "pexels" ? config.pexelsConfigured : config.pixabayConfigured;

function downloadHref(url: string) {
  if (!url.startsWith("/api/media/proxy")) return mediaToProxyUrl(url, true);
  const parsed = new URL(url, window.location.origin);
  parsed.searchParams.set("download", "1");
  return parsed.pathname + parsed.search;
}

export default function DiscoveryHub({ config, requireAccess, notify, onProjectCreated }: Props) {
  const daily = useMemo(() => getDailyTopic(), []);
  const [tab, setTab] = useState<HubTab>("daily");
  const [source, setSource] = useState<"pexels" | "pixabay">(config.pexelsConfigured ? "pexels" : "pixabay");
  const [query, setQuery] = useState(daily.query);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [generatedAssets, setGeneratedAssets] = useState<MediaAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [building, setBuilding] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(AI_VIDEO_PROVIDERS[0].promptHint);
  const [aiDuration, setAiDuration] = useState(5);

  const allAssets = useMemo(() => [...generatedAssets, ...assets], [assets, generatedAssets]);
  const selectedAssets = useMemo(() => allAssets.filter((asset) => selectedIds.has(asset.id)), [allAssets, selectedIds]);

  function toggleAsset(asset: MediaAsset) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(asset.id)) next.delete(asset.id);
      else {
        if (next.size >= 5) {
          notify("Choose up to 5 clips for one 60-second Short.", "info");
          return current;
        }
        next.add(asset.id);
      }
      return next;
    });
  }

  async function searchStock(nextSource: "pexels" | "pixabay" = source, nextQuery = query) {
    if (!requireAccess()) return;
    if (!stockConfigured(config, nextSource)) {
      notify(nextSource === "pexels" ? "Add PEXELS_API_KEY in your server environment to browse Pexels." : "Add PIXABAY_API_KEY in your server environment to browse Pixabay.", "info");
      return;
    }
    setSearching(true);
    try {
      const url = `/api/discovery?kind=stock&source=${nextSource}&query=${encodeURIComponent(nextQuery)}`;
      const data = await apiRequest<{ assets: MediaAsset[]; message: string | null }>(url);
      setAssets(data.assets);
      if (data.message) notify(data.message, "info");
      else if (!data.assets.length) notify("No safe clips found. Try a broader word like animals, ocean, or flowers.", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not search videos.", "error");
    } finally {
      setSearching(false);
    }
  }

  async function generateAiClip() {
    if (!requireAccess()) return;
    if (!config.pollinationsConfigured) {
      notify("Add POLLINATIONS_API_KEY for in-app AI MP4 generation. You can still open the free providers below.", "info");
      return;
    }
    setGeneratingVideo(true);
    try {
      const data = await apiRequest<{ asset: MediaAsset }>("/api/ai-video", jsonRequest({ prompt: childSafeVideoPrompt(aiPrompt), duration: aiDuration }));
      setGeneratedAssets((current) => [data.asset, ...current]);
      setSelectedIds((current) => new Set(current).add(data.asset.id));
      notify("AI clip generated and added to your selected bin.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "AI clip generation failed.", "error");
    } finally {
      setGeneratingVideo(false);
    }
  }

  async function buildDailyShort() {
    if (!requireAccess()) return;
    setBuilding(true);
    try {
      const data = await apiRequest<{ project: StudioProject; note: string }>("/api/discovery", jsonRequest({
        title: daily.title,
        idea: `${daily.title}: a gentle preschool story about ${daily.lesson}.`,
        category: daily.category,
        ageGroup: "3–5 years",
        duration: selectedAssets.length >= 4 ? 40 : 45,
        assets: selectedAssets,
      }, "POST"));
      let project = data.project;
      if (config.pollinationsConfigured || config.elevenLabsConfigured) {
        for (const scene of project.scenes) {
          try {
            const voiced = await apiRequest<{ project: StudioProject }>("/api/voice", jsonRequest({ projectId: project.id, sceneId: scene.id }));
            project = voiced.project;
          } catch {
            // Keep the assembled video if a provider rate-limits one voice line.
          }
        }
      }
      onProjectCreated(project);
      notify(config.pollinationsConfigured || config.elevenLabsConfigured ? "Daily clips, edits, captions, music and voiceovers are ready to review." : `${data.note} Add or record voices in the editor.`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not auto-build today's Short.", "error");
    } finally {
      setBuilding(false);
    }
  }

  async function copyPrompt(prompt: string) {
    const full = childSafeVideoPrompt(prompt);
    setAiPrompt(prompt);
    await navigator.clipboard?.writeText(full);
    notify("Kid-safe prompt copied. Paste it into the provider's prompt box.", "success");
  }

  return (
    <div className="discovery-page">
      <div className="page-head discovery-head">
        <div>
          <p className="eyebrow"><span className="eyebrow-sun">✳</span> DAILY AUTOMATION HUB</p>
          <h1>Find clips, auto-edit, <span>then upload.</span></h1>
          <p>Royalty-free footage and free AI video providers are gathered into one kid-safe workflow.</p>
        </div>
        <button className="button button-primary top-create" onClick={buildDailyShort} disabled={building}>{building ? <LoaderCircle size={18} className="spin" /> : <Zap size={18} />} {building ? "Auto-editing…" : "Build today’s Short"}</button>
      </div>

      <div className="hub-tabs">
        <button className={tab === "daily" ? "active" : ""} onClick={() => setTab("daily")}><CalendarClock size={17} /> Daily plan</button>
        <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}><Video size={17} /> Browse videos</button>
        <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}><WandSparkles size={17} /> Free AI generators</button>
        <span className="selected-bin-pill"><Film size={15} /> {selectedAssets.length}/5 selected</span>
      </div>

      {tab === "daily" && <section className="daily-hero panel">
        <div className="daily-hero-art"><span className="daily-orbit">◌</span><span className="daily-star">✦</span><div className="daily-play"><Play size={30} fill="currentColor" /></div></div>
        <div className="daily-hero-copy">
          <div className="daily-date"><BadgeCheck size={17} /> Today’s kid-safe topic</div>
          <h2>{daily.title}</h2>
          <p>{daily.category} · search theme: <strong>{daily.query}</strong></p>
          <div className="daily-lesson"><Sparkles size={16} /> <span>Lesson: {daily.lesson}.</span></div>
          <div className="daily-actions"><button className="button button-primary" onClick={buildDailyShort} disabled={building}>{building ? <LoaderCircle size={17} className="spin" /> : <Zap size={17} />} Auto-build with {selectedAssets.length ? `${selectedAssets.length} clips` : "original animation"}</button><button className="button button-outline" onClick={() => { setTab("stock"); void searchStock(source, daily.query); }}><Search size={16} /> Find matching footage</button></div>
        </div>
      </section>}

      {tab === "daily" && <div className="automation-steps">
        {[
          ["1", "Daily brief", "A rotating lesson, category, and safe search topic."],
          ["2", "Collect clips", "Browse Pexels/Pixabay or generate AI clips. Credits are saved."],
          ["3", "Auto-edit", "Clips are placed on a vertical timeline with captions and music."],
          ["4", "Voice & review", "Generate or record character narration, then watch the whole Short."],
          ["5", "Export / upload", "Download WebM/MP4 route or publish through connected YouTube OAuth."],
        ].map(([step, title, copy]) => <article className="automation-step panel" key={step}><span>{step}</span><h3>{title}</h3><p>{copy}</p></article>)}
      </div>}

      {tab === "daily" && selectedAssets.length > 0 && <SelectedClips assets={selectedAssets} onToggle={toggleAsset} />}

      {tab === "stock" && <section className="stock-search panel">
        <div className="stock-source-switch"><button className={source === "pexels" ? "active" : ""} onClick={() => { setSource("pexels"); void searchStock("pexels"); }}>Pexels {!config.pexelsConfigured && <Lock size={13} />}</button><button className={source === "pixabay" ? "active" : ""} onClick={() => { setSource("pixabay"); void searchStock("pixabay"); }}>Pixabay {!config.pixabayConfigured && <Lock size={13} />}</button></div>
        <form className="stock-search-row" onSubmit={(event) => { event.preventDefault(); void searchStock(source); }}>
          <Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search baby animals, ocean, flowers…" maxLength={100} /><button className="button button-primary" disabled={searching}>{searching ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />} Search</button>
        </form>
        <div className="query-chips">{KID_QUERIES.map((item) => <button key={item} onClick={() => { setQuery(item); void searchStock(source, item); }}>{item}</button>)}</div>
        {!config.pexelsConfigured && !config.pixabayConfigured && <div className="key-required"><ShieldCheck size={18} /><div><strong>Add a free stock-video API key.</strong><span>Pexels and Pixabay both provide free developer keys. The key stays on the server as PEXELS_API_KEY or PIXABAY_API_KEY.</span></div></div>}
      </section>}

      {tab === "stock" && <div className="media-grid">
        {searching && Array.from({ length: 4 }).map((_, index) => <div className="media-card media-skeleton panel" key={index}><div /><p>Finding safe clips…</p></div>)}
        {!searching && assets.map((asset) => <MediaCard key={asset.id} asset={asset} selected={selectedIds.has(asset.id)} onToggle={() => toggleAsset(asset)} />)}
      </div>}

      {tab === "ai" && <section className="ai-connector panel">
        <div className="ai-connector-copy"><span className="connection-badge connected">API CONNECTOR</span><h2>Generate an AI video clip in-app</h2><p>Pollinations can return short vertical AI clips when your free/account key is configured. Longer videos are best assembled from 4–5 five-second clips.</p></div>
        <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} maxLength={700} rows={4} />
        <div className="ai-connector-actions"><label>Clip length<select value={aiDuration} onChange={(event) => setAiDuration(Number(event.target.value))}><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select></label><button className="button button-primary" onClick={generateAiClip} disabled={generatingVideo}>{generatingVideo ? <LoaderCircle size={17} className="spin" /> : <WandSparkles size={17} />} {generatingVideo ? "Rendering… can take minutes" : "Generate AI clip"}</button></div>
        {!config.pollinationsConfigured && <p className="provider-warning"><Lock size={15} /> Set POLLINATIONS_API_KEY on the server to activate this connector.</p>}
      </section>}

      {tab === "ai" && generatedAssets.length > 0 && <SelectedClips assets={selectedAssets.some((asset) => asset.aiGenerated) ? selectedAssets : generatedAssets} onToggle={toggleAsset} generatedOnly />}

      {tab === "ai" && <div className="provider-grid">
        {AI_VIDEO_PROVIDERS.map((provider) => <article className="provider-card panel" key={provider.id}>
          <div className="provider-card-top"><span className={`provider-access ${provider.access}`}>{provider.access === "api" ? "API-capable" : provider.access === "self-host" ? "Self-host" : "Web app"}</span><h3>{provider.name}</h3></div>
          <p className="provider-best">{provider.bestFor}</p>
          <div className="provider-detail"><strong>Free access</strong><span>{provider.freePattern}</span></div>
          <div className="provider-detail"><strong>Export</strong><span>{provider.exportNote}</span></div>
          <div className="provider-detail warning"><strong>Rights</strong><span>{provider.commercialNote}</span></div>
          <div className="provider-actions"><button onClick={() => void copyPrompt(provider.promptHint)}><ClipboardCopy size={15} /> Copy prompt</button><a href={provider.url} target="_blank" rel="noopener noreferrer">Open <ExternalLink size={14} /></a></div>
        </article>)}
      </div>}

      <section className="legal-note panel"><ShieldCheck size={20} /><div><strong>Important automation boundary.</strong><span> This hub does not scrape YouTube, Arena, TikTok, or other creators’ videos. It uses licensed stock APIs, configured AI APIs, and your own/original animation. Always review each clip, license, voice, and made-for-kids setting before publishing.</span></div></section>
    </div>
  );
}

function SelectedClips({ assets, onToggle, generatedOnly = false }: { assets: MediaAsset[]; onToggle: (asset: MediaAsset) => void; generatedOnly?: boolean }) {
  return <section className="selected-bin panel"><div><h2>{generatedOnly ? "Generated clips" : "Selected clips"}</h2><p>{assets.length} chosen · clips are auto-placed in scene order.</p></div><div className="selected-strip">{assets.map((asset, index) => <div className="selected-chip" key={asset.id}><span>{index + 1}</span><video src={asset.downloadUrl} poster={asset.posterUrl} muted playsInline preload="metadata" /><button onClick={() => onToggle(asset)}>×</button><small>{asset.author}</small></div>)}</div></section>;
}

function MediaCard({ asset, selected, onToggle }: { asset: MediaAsset; selected: boolean; onToggle: () => void }) {
  return <article className={`media-card panel ${selected ? "selected" : ""}`}>
    <div className="media-preview"><video src={asset.downloadUrl} poster={asset.posterUrl} muted loop playsInline preload="metadata" /><a href={downloadHref(asset.downloadUrl)} className="media-download" title="Download clip through Littleloop" download><Download size={16} /></a><a href={asset.pageUrl} target="_blank" rel="noopener noreferrer" className="media-source-link" title="Open source page"><ExternalLink size={15} /></a>{selected && <span className="media-selected"><Check size={15} /></span>}</div>
    <div className="media-body"><h3>{asset.title}</h3><p>{asset.author} · {asset.source}</p><div className="media-tags">{asset.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div><small>{asset.licenseNote}</small><div className="media-actions"><button onClick={onToggle}>{selected ? "Selected" : "Add to auto-edit"} {selected ? <Check size={14} /> : <ArrowRight size={14} />}</button></div></div>
  </article>;
}
