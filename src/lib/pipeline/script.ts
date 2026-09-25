import { NICHES, generateShort, type NicheId } from "@/lib/generator";
import { isExhausted, markCall, markFailure, looksLikeQuotaError } from "./usage";

export interface VideoScript {
  title: string;
  description: string;
  tags: string[];
  scenes: string[];
  provider: string;
}

const PROMPT = (topic: string, nicheLabel: string, format: "short" | "long") => `
You are the head writer for a viral faceless video channel in the "${nicheLabel}" niche.
Write a ${format === "short" ? "YouTube Short (vertical, 30-45 seconds, exactly 5 scenes)" : "long-form YouTube video (3-4 minutes, exactly 14 scenes)"} about: "${topic}".

Rules:
- Scene 1 must be an irresistible hook (pattern interrupt, contrarian claim or shocking fact).
- Each scene is pure narration, 1-3 spoken sentences, no stage directions, no scene labels.
- Escalate tension scene by scene; end with a payoff and a natural subscribe CTA.
- No emojis, no hashtags inside the narration.

Respond with ONLY a JSON object:
{
  "title": "punchy video title, under 80 chars",
  "description": "2-3 sentence YouTube description with a hook",
  "tags": ["8-12 keyword tags"],
  "scenes": ["scene 1 narration", "scene 2 narration", ...]
}`;

function extractJson(raw: string): {
  title: string;
  description: string;
  tags: string[];
  scenes: string[];
} {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in model output");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed.title || !Array.isArray(parsed.scenes) || parsed.scenes.length < 3) {
    throw new Error("model output missing scenes");
  }
  return {
    title: String(parsed.title).slice(0, 100),
    description: String(parsed.description ?? "").slice(0, 900),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 14) : [],
    scenes: parsed.scenes.map((s: unknown) => String(s).trim()).filter(Boolean),
  };
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(id);
  }
}

async function viaGroq(prompt: string): Promise<string> {
  const { status, text } = await fetchJson("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      response_format: { type: "json_object" },
    }),
  });
  if (status !== 200) throw Object.assign(new Error(text), { status, body: text });
  return JSON.parse(text).choices[0].message.content;
}

async function viaGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const { status, text } = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
    }),
  });
  if (status !== 200) throw Object.assign(new Error(text), { status, body: text });
  return JSON.parse(text).candidates[0].content.parts[0].text;
}

async function viaOpenRouter(prompt: string): Promise<string> {
  const { status, text } = await fetchJson("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
    }),
  });
  if (status !== 200) throw Object.assign(new Error(text), { status, body: text });
  return JSON.parse(text).choices[0].message.content;
}

function makeLocalScript(topic: string, niche: NicheId | "custom", format: "short" | "long"): VideoScript {
  const nicheLabel = niche === "custom" ? "viral storytelling" : NICHES.find((n) => n.id === niche)!.label;
  const short = generateShort({ topic, niche, voice: "nova", style: "cinematic" });
  const titled = topic.charAt(0).toUpperCase() + topic.slice(1);

  if (format === "short") {
    return {
      title: short.title,
      description: `${short.title} — a ${nicheLabel} short forged on autopilot.`,
      tags: [topic, nicheLabel.toLowerCase(), "shorts", "faceless", "ai video", "viral"],
      scenes: short.scenes.map((s) => s.text),
      provider: "local",
    };
  }

  // long-form local fallback: hook + expansion beats + recap + outro (~14 scenes)
  const base = short.scenes.map((s) => s.text);
  const scenes = [
    base[0],
    `Let's slow down and actually unpack ${topic}, because the surface story is the least interesting part.`,
    base[1],
    `Think about what that means in practice. Most people hear about ${topic} and move on — completely missing the mechanism underneath.`,
    base[2],
    `And this is where it gets genuinely strange. The deeper researchers looked, the less the standard explanation held together.`,
    base[3],
    `Here's a concrete example. When the data was finally analysed properly, the pattern had been sitting in plain sight for decades.`,
    `So why isn't this common knowledge? Partly habit, partly incentives — and partly because the truth about ${topic} is inconvenient to the status quo.`,
    `Let's zoom out for a second. Every few generations a topic like this quietly rewires how we understand the world, and ${titled} fits the pattern perfectly.`,
    base[4],
    `If you're still with me, you're already ahead of ninety percent of people who clicked on this video.`,
    `The one-sentence summary worth remembering: ${topic} matters far more than the headlines suggest — and now you know exactly why.`,
    `If this opened your eyes, subscribe — the next deep dive is already rendering.`,
  ];
  return {
    title: `${short.title} — full breakdown`,
    description: `A deep dive into ${topic}. ${base[0]}\n\nForged on autopilot in the ${nicheLabel} niche.`,
    tags: [topic, nicheLabel.toLowerCase(), "deep dive", "explained", "faceless", "documentary"],
    scenes,
    provider: "local",
  };
}

export async function genScript(opts: {
  topic: string;
  niche: NicheId | "custom";
  format: "short" | "long";
}): Promise<VideoScript> {
  const nicheLabel =
    opts.niche === "custom" ? "viral storytelling" : NICHES.find((n) => n.id === opts.niche)!.label;
  const prompt = PROMPT(opts.topic, nicheLabel, opts.format);

  const chain: { id: string; run: (() => Promise<string>) | null }[] = [
    { id: "groq", run: process.env.GROQ_API_KEY ? () => viaGroq(prompt) : null },
    { id: "gemini", run: process.env.GEMINI_API_KEY ? () => viaGemini(prompt) : null },
    { id: "openrouter", run: process.env.OPENROUTER_API_KEY ? () => viaOpenRouter(prompt) : null },
  ];

  const targetScenes = opts.format === "short" ? 5 : 14;

  for (const p of chain) {
    if (!p.run || (await isExhausted(p.id))) continue;
    try {
      const raw = await p.run();
      const parsed = extractJson(raw);
      await markCall(p.id);
      // normalise scene count
      let scenes = parsed.scenes;
      if (scenes.length > targetScenes) scenes = scenes.slice(0, targetScenes);
      while (scenes.length < targetScenes) {
        scenes.splice(scenes.length - 1, 0, "And that is only half of the story — keep watching.");
      }
      return { ...parsed, scenes, provider: p.id };
    } catch (err) {
      const e = err as Error & { status?: number; body?: string };
      const quota = looksLikeQuotaError(e.status ?? 0, e.body ?? e.message ?? "");
      await markFailure(p.id, quota);
      console.error(`script provider ${p.id} failed${quota ? " (quota)" : ""}:`, e.message);
    }
  }

  console.log("all cloud script providers unavailable — using local forge engine");
  return makeLocalScript(opts.topic, opts.niche, opts.format);
}

/* ── caption timing helpers (shared with renderer) ─────────── */

export interface TimedChunk {
  text: string;
  start: number;
  end: number;
}

export function estimateSceneDuration(text: string): number {
  let dur = 0.3;
  for (const w of text.split(/\s+/)) {
    const len = w.replace(/[^a-zA-Z0-9']/g, "").length;
    dur += Math.min(0.55, 0.16 + len * 0.05) + 0.05;
  }
  return dur + 0.35;
}

export function captionChunks(text: string, sceneDuration: number): TimedChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += 3) groups.push(words.slice(i, i + 3));
  const totalWeight = words.reduce((acc, w) => acc + w.length + 1, 0);
  const pad = 0.25;
  const usable = Math.max(sceneDuration - pad * 2, sceneDuration * 0.6);
  let cursor = pad;
  return groups.map((g) => {
    const weight = g.reduce((acc, w) => acc + w.length + 1, 0);
    const dur = (weight / totalWeight) * usable;
    const chunk = { text: g.join(" ").toUpperCase(), start: cursor, end: cursor + dur };
    cursor += dur;
    return chunk;
  });
}

export function formatSrtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}
