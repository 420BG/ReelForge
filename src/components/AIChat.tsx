"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Bot, Download, ExternalLink, FolderOpen, Film, LoaderCircle, Send,
  Sparkles, TvMinimalPlay, Video, WandSparkles,
} from "lucide-react";
import type { ChatCard } from "@/lib/chat";
import { AI_VIDEO_PROVIDERS, childSafeVideoPrompt } from "@/lib/discovery";
import { apiRequest, jsonRequest } from "@/lib/client-api";
import type { MediaAsset, StudioConfig, StudioProject, ViewName } from "@/lib/types";

type Props = {
  config: StudioConfig;
  requireAccess: () => boolean;
  notify: (message: string, kind?: "success" | "error" | "info") => void;
  onOpenProject: (project: StudioProject) => void;
  onOpenProjectById: (projectId: string) => Promise<void>;
  onGo: (view: ViewName) => void;
};

type ChatMessage = { role: "user" | "assistant"; content: string; card?: ChatCard; meta?: string };

const SUGGESTIONS = [
  { icon: Sparkles, text: "Build today’s video" },
  { icon: Video, text: "Find videos of baby animals" },
  { icon: WandSparkles, text: "Which free AI video generators are real?" },
  { icon: Film, text: "Make a story about a shy turtle" },
  { icon: TvMinimalPlay, text: "How do I upload to YouTube?" },
];

function downloadHref(url: string) {
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/api/media/proxy")) return url;
  const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  parsed.searchParams.set("download", "1");
  return parsed.pathname + parsed.search;
}

function metaLabel(model: string) {
  if (model === "openrouter") return "free AI · OpenRouter";
  if (model === "pollinations") return "free AI · Pollinations";
  return "built-in assistant";
}

export default function AIChat({ config, requireAccess, notify, onOpenProject, onOpenProjectById, onGo }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! I'm Littleloop — your one and only chat. Say “generate a video about …” and I'll build it; the editor is directly below this chat so you can cut, voice and export straight away. My generator options are lined up under every message: generate in-app (unlimited, key-free render) or open any free AI web generator with a copied kid-safe prompt.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const configured = config.openRouterConfigured || config.pollinationsConfigured;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || thinking) return;
    if (!requireAccess()) return;
    setDraft("");
    const history = [...messages.map(({ role, content }) => ({ role, content }))];
    setMessages((current) => [...current, { role: "user", content: message }]);
    setThinking(true);
    try {
      const data = await apiRequest<{ reply: string; card?: ChatCard; usedModel: string }>("/api/chat", jsonRequest({ message, history }));
      setMessages((current) => [...current, { role: "assistant", content: data.reply, card: data.card, meta: metaLabel(data.usedModel) }]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The assistant could not answer.", "error");
      setMessages((current) => [...current, { role: "assistant", content: "I hit a snag answering that. Please try again in a moment.", meta: "error" }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="chat-page">
      <div className="page-head chat-head">
        <div>
          <p className="eyebrow"><span className="eyebrow-sun">✳</span> ONE CHAT · GENERATE · EDIT BELOW</p>
          <h1>Chat up top, <span>editor right below.</span></h1>
          <p>Every free AI video option lives in this one chat — generate a video here, then edit it in the section directly underneath.</p>
        </div>
        <span className={`chat-mode ${configured ? "live" : ""}`}>{configured ? <Sparkles size={15} /> : <Bot size={15} />} {configured ? "Free AI connected" : "Built-in mode (no key)"}</span>
      </div>

      <section className="chat-panel panel">
        <div className="chat-messages" ref={scrollRef} aria-live="polite">
          {messages.map((message, index) => (
            <div key={index} className={`chat-message ${message.role}`}>
              {message.role === "assistant" && <span className="chat-avatar"><Bot size={17} /></span>}
              <div className="chat-bubble">
                <p>{message.content}</p>
                {message.meta && <span className={`chat-meta ${message.meta === "error" ? "error" : ""}`}>{message.meta}</span>}
                {message.card?.kind === "project" && <ChatProjectCard card={message.card} onOpen={() => message.card?.kind === "project" && (message.card.project ? onOpenProject(message.card.project) : void onOpenProjectById(message.card.projectId))} />}
                {message.card?.kind === "assets" && <ChatAssetCard card={message.card} onBrowse={() => onGo("discover")} />}
                {message.card?.kind === "providers" && <ChatProviderCard card={message.card} onBrowse={() => onGo("discover")} />}
                {message.card?.kind === "projects" && <ChatProjectsCard card={message.card} onOpen={onOpenProjectById} />}
              </div>
            </div>
          ))}
          {thinking && <div className="chat-message assistant"><span className="chat-avatar"><Bot size={17} /></span><div className="chat-bubble typing"><span /><span /><span /></div></div>}
        </div>

        <div className="generator-strip">
          <div className="generator-head">
            <span className="generator-live">FREE AI VIDEO GENERATORS</span>
            <strong>Every free option, in this one chat</strong>
          </div>
          <div className="generator-options">
            <button className="generator-main" onClick={() => void send("Generate an AI video for me now")} disabled={thinking}>
              <WandSparkles size={16} /> Generate in-app now <em>unlimited · key-free render</em>
            </button>
            {AI_VIDEO_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                className="generator-chip"
                title={provider.freePattern}
                onClick={() => {
                  void navigator.clipboard?.writeText(childSafeVideoPrompt(provider.promptHint));
                  window.open(provider.url, "_blank", "noopener,noreferrer");
                  notify(`Kid-safe prompt copied — paste it in ${provider.name}.`, "success");
                }}
              >
                <span>{provider.name}</span>
                <small>{provider.access === "api" ? "free API" : "free web"}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="chat-suggestions">
          {SUGGESTIONS.map((item) => <button key={item.text} onClick={() => void send(item.text)} disabled={thinking}><item.icon size={14} /> {item.text}</button>)}
        </div>

        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask me to build today’s video, find clips, create a story… (Shift+Enter for new line)" rows={2} maxLength={1200} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(draft); } }} />
          <button type="submit" disabled={thinking || !draft.trim()} aria-label="Send message">{thinking ? <LoaderCircle size={19} className="spin" /> : <Send size={19} />}</button>
        </form>
        <div className="chat-composer-note"><ShieldCheck /> Your keys stay on the server. I never create fake accounts or bypass provider limits — unlimited generation comes from the built-in renderer and your own connected keys.</div>
      </section>
    </div>
  );
}

function ShieldCheck() { return <span className="chat-note-icon">✓</span>; }

function ChatProjectCard({ card, onOpen }: { card: Extract<ChatCard, { kind: "project" }>; onOpen: () => void }) {
  return <div className="chat-card chat-card-project"><Film size={17} /><div><strong>{card.title}</strong><span>New draft project · ready to edit</span></div><button onClick={onOpen}>Open editor <ArrowRight size={14} /></button></div>;
}

function ChatAssetCard({ card, onBrowse }: { card: Extract<ChatCard, { kind: "assets" }>; onBrowse: () => void }) {
  return <div className="chat-card chat-card-assets">
    <div className="chat-assets-grid">
      {card.assets.slice(0, 6).map((asset: MediaAsset) => (
        <div className="chat-asset" key={asset.id}>
          <video src={asset.downloadUrl} poster={asset.posterUrl} muted playsInline preload="metadata" />
          <a href={downloadHref(asset.downloadUrl)} download title="Download"><Download size={13} /></a>
          <span>{asset.author}</span>
        </div>
      ))}
    </div>
    {card.note && <small>{card.note}</small>}
    <button onClick={onBrowse}>Open Auto Hub to auto-edit clips <ArrowRight size={14} /></button>
  </div>;
}

function ChatProviderCard({ card, onBrowse }: { card: Extract<ChatCard, { kind: "providers" }>; onBrowse: () => void }) {
  return <div className="chat-card chat-card-providers">
    {card.providers.slice(0, 6).map((provider) => (
      <div className="chat-provider" key={provider.name}><a href={provider.url} target="_blank" rel="noopener noreferrer"><strong>{provider.name}</strong><ExternalLink size={12} /></a><span>{provider.freePattern}</span></div>
    ))}
    <button onClick={onBrowse}>See full provider details in Auto Hub <ArrowRight size={14} /></button>
  </div>;
}

function ChatProjectsCard({ card, onOpen }: { card: Extract<ChatCard, { kind: "projects" }>; onOpen: (id: string) => Promise<void> }) {
  return <div className="chat-card chat-card-list">
    {card.items.map((item) => (
      <button key={item.id} onClick={() => void onOpen(item.id)}><FolderOpen size={14} /><span><strong>{item.title}</strong><small>{item.category} · {item.duration}s · {item.status}</small></span><ArrowRight size={13} /></button>
    ))}
  </div>;
}
