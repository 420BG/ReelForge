"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Dices, Loader2, Play, RotateCcw, Send } from "lucide-react";
import type { AgentVideo } from "@/content/types";
import { api, post, useAgent } from "./data";
import { Button, Chip, NavIcon, Panel, PanelTitle } from "./ui";

type Turn = { role: "user" | "agent"; text: string; video?: AgentVideo; note?: string | null };

function PlanCard({ video }: { video: AgentVideo }) {
  const story = video.story;
  const steps = [
    `Script generation — ${story?.scenes.length ?? 0} scenes${story?.source === "template" ? " (template writer)" : ""}`,
    `Scene creation (${video.settings.style.replace("-", " ")} style)`,
    `Narration (${video.settings.voiceGender === "auto" ? "voice matched to niche" : `${video.settings.voiceGender} voice`})`,
    `Render video (vertical 9:16, ~${video.settings.targetDuration}s)`,
    "Review, then upload to YouTube when you approve",
  ];
  return (
    <div className="mt-3 rounded-2xl border border-white/[0.08] bg-void/60 p-4">
      <p className="mb-2 font-display text-sm font-bold">“{video.title}”</p>
      <ul className="space-y-1.5">{steps.map((step) => <li key={step} className="flex items-start gap-2 text-xs text-mute"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime" />{step}</li>)}</ul>
      <p className="mt-3 text-[11px] text-dim">Rendering usually takes several minutes. You can leave this page; progress shows on Home and My Videos.</p>
    </div>
  );
}

export default function Chat() {
  const { overview, notify, refresh } = useAgent();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const autoSent = useRef(false);

  // Keep the conversation while you move around the studio (this browser tab only).
  useEffect(() => {
    try { const saved = sessionStorage.getItem("rf-chat"); if (saved) setTurns(JSON.parse(saved)); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem("rf-chat", JSON.stringify(turns.slice(-30))); } catch { /* storage unavailable */ }
  }, [turns]);

  // Message typed in the Home chat box arrives as ?q=… — send it once, then clean the URL.
  useEffect(() => {
    const q = params?.get("q");
    if (!q || autoSent.current) return;
    autoSent.current = true;
    router.replace("/studio/chat");
    void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  const suggestions = useMemo(() => {
    const niches = (overview?.niches ?? []).filter((n) => n.audience !== "kids");
    const out: { topic: string; niche: string; label: string }[] = [];
    for (let i = 0; i < 3 && niches.length; i++) {
      const niche = niches[(seed * 3 + i * 7) % niches.length];
      out.push({ topic: niche.topics[(seed + i) % niche.topics.length], niche: niche.id, label: niche.label });
    }
    return out;
  }, [overview?.niches, seed]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setTurns((t) => [...t, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const history = turns.slice(-10).map((turn) => ({ role: turn.role, text: turn.text }));
      const data = await api<{ reply: string; note: string | null; video: AgentVideo | null }>("/api/agent/chat", post({ message, history }));
      setTurns((t) => [...t, { role: "agent", text: data.reply, video: data.video ?? undefined, note: data.note }]);
    } catch (error) {
      setTurns((t) => [...t, { role: "agent", text: error instanceof Error ? error.message : "Something went wrong." }]);
    } finally {
      setBusy(false);
    }
  }

  async function produce(video: AgentVideo) {
    try {
      await api(`/api/agent/videos/${video.id}/action`, post({ action: "produce" }));
      notify("Production started — I'll keep going in the background.");
      setTurns((t) => [...t, { role: "agent", text: `Started producing “${video.title}”. Open it any time to watch progress.`, video: { ...video, workflow: "processing" } }]);
      void refresh(true);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not start.", "error"); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Panel className="flex min-h-[70vh] flex-col">
        <PanelTitle icon={<NavIcon name="chat" className="h-4 w-4 text-lime" />} right={<span className="flex items-center gap-3">{turns.length > 0 && <button type="button" onClick={() => setTurns([])} className="text-[11px] font-semibold text-dim hover:text-cream">New chat</button>}<span className="flex items-center gap-1.5 text-[11px] font-semibold text-dim"><span className="h-1.5 w-1.5 rounded-full bg-lime" />ready</span></span>}>AI assistant</PanelTitle>
        <div className="-mr-2 flex-1 space-y-4 overflow-y-auto pr-2">
          {turns.length === 0 && (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime text-void"><NavIcon name="bolt" className="h-4 w-4" /></span>
              <div className="rounded-2xl rounded-tl-sm bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-mute">Hi! Ask me anything — video ideas, hooks, scripts, YouTube growth. When you want a video, just say so: <em className="text-cream">“Make a 45 second scary short about a lighthouse”</em>, <em className="text-cream">“Make a 5 minute history video about Pompeii”</em>, or paste your own script with <em className="text-cream">“Make a video from this script:”</em> — I&apos;ll keep your words exactly.</div>
            </div>
          )}
          {turns.map((turn, i) => turn.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-violet/25 px-4 py-3 text-sm">{turn.text}</div>
          ) : (
            <div key={i} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime text-void"><NavIcon name="bolt" className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1 whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-cream">
                {turn.text}
                {turn.note && <p className="mt-2 text-[11px] text-amber-200">{turn.note}</p>}
                {turn.video && turn.video.workflow === "draft" && <PlanCard video={turn.video} />}
                {turn.video && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {turn.video.workflow === "draft" && <Button onClick={() => void produce(turn.video!)} className="h-9 text-xs"><Play className="h-3.5 w-3.5" /> Produce now</Button>}
                    <Button href={`/studio/videos/${turn.video.id}`} variant="outline" className="h-9 text-xs">Open editor <ArrowRight className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-xs text-dim"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</div>}
          <div ref={endRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="mt-4 flex items-end gap-2 rounded-2xl border border-white/10 bg-void/60 p-1.5 pl-4">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }} rows={Math.min(8, Math.max(1, input.split("\n").length))} maxLength={16000} placeholder="Ask anything, or paste a script…" className="max-h-48 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-dim" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid h-10 w-10 place-items-center rounded-xl bg-lime text-void disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip onClick={() => { const s = suggestions[0]; if (s) void send(`Create a 30 second ${s.label} video about ${s.topic}`); }}><Dices className="mr-1 inline h-3 w-3" />Random idea</Chip>
          <Chip onClick={() => void send("Create a 45 second scary story that happens at 3 AM, dark cinematic")}>Scary story</Chip>
          <Chip onClick={() => void send("Create a 30 second psychology fact video about why we procrastinate")}>Psychology fact</Chip>
          <Chip onClick={() => void send("Create a 60 second emotional love story with a twist ending, cinematic")}>60s love story</Chip>
        </div>
      </Panel>

      <Panel>
        <PanelTitle icon={<NavIcon name="bolt" className="h-4 w-4 text-lime" />} right={<button onClick={() => setSeed((s) => s + 1)} className="flex items-center gap-1 text-[11px] font-semibold text-mute hover:text-lime"><RotateCcw className="h-3 w-3" /> Refresh</button>}>Random suggestions</PanelTitle>
        <div className="space-y-2">
          {suggestions.map((s) => (
            <button key={s.topic} onClick={() => void send(`Create a 30 second ${s.label} video about ${s.topic}`)} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-lime/30">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{s.topic}</span><span className="block text-[11px] text-dim">Short · 9:16 · 30s</span></span>
              <span className="shrink-0 rounded-full border border-lime/30 px-2 py-0.5 text-[10px] font-bold text-lime">{s.label.split(" ")[0]}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-dim">Story mode: the AI writes an original story from your idea. Script mode: paste your own narration and it's used word for word. Facts in factual niches need a keyed story model (Groq, Gemini, Cerebras…).</p>
      </Panel>
    </div>
  );
}
