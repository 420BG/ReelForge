import { getNiche, type NicheDefinition } from "@/content/niches/registry";
import { normalizeSeo } from "@/content/seo";
import { completeJson, textModelAvailable } from "@/content/story-engine/llm";
import { ATMOSPHERE, CAMERA_MOVES, MUSIC_MOODS, normalizeCharacters, TRANSITIONS, WORDS_PER_SECOND } from "@/content/story-engine/normalize";
import type { AtmosphereFx, CameraMove, LocationProfile, MusicMood, PlanScene, StoryPart, StoryPlan, TransitionKind, VideoFormat, VisualStyle } from "@/content/types";

/**
 * SCRIPT MODE — "use my words". The user's script is the narration, word for word.
 * It is split into scenes deterministically (by sentences), so the AI can never rewrite it;
 * the AI only designs the shots (visuals, camera, mood) for each line.
 * Long scripts are processed part by part (saved after each part, resumable), same as long stories.
 */

export type ScriptRequest = { niche: string; script: string; style: VisualStyle; format: VideoFormat; timezone: string };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
const words = (value: string) => value.split(/\s+/).filter(Boolean).length;

export function cleanScript(script: string) {
  return script.replace(/\r/g, "").replace(/^\s*(scene|shot)\s*\d+\s*[:.-]\s*/gim, "").replace(/\[[^\]]*\]|\([^)]*\bvisual[^)]*\)/gi, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function estimateSeconds(script: string) {
  return Math.round(words(cleanScript(script)) / WORDS_PER_SECOND);
}

/** Splits narration into scene lines of ~`targetWords` words without changing a single word. */
export function splitScript(script: string, targetWords: number): string[] {
  const sentences = cleanScript(script).replace(/\n+/g, " ").match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
  const pieces: string[] = [];
  for (const sentence of sentences) {
    if (words(sentence) <= targetWords * 1.6) { pieces.push(sentence); continue; }
    // Very long sentence: break at commas / semicolons, else every ~targetWords words.
    const clauses = sentence.split(/(?<=[,;:—])\s+/);
    let current = "";
    for (const clause of clauses) {
      if (current && words(`${current} ${clause}`) > targetWords * 1.3) { pieces.push(current); current = clause; } else current = current ? `${current} ${clause}` : clause;
    }
    if (current) {
      const w = current.split(/\s+/);
      for (let i = 0; i < w.length; i += Math.ceil(targetWords * 1.3)) pieces.push(w.slice(i, i + Math.ceil(targetWords * 1.3)).join(" "));
    }
  }
  const lines: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && words(`${current} ${piece}`) > targetWords * 1.25) { lines.push(current); current = piece; } else current = current ? `${current} ${piece}` : piece;
  }
  if (current) lines.push(current);
  return lines;
}

/** Seconds of narration per scene (one AI image each). Shorts cut faster than long videos. */
const secondsPerScene = (format: VideoFormat) => (format === "long" ? 9 : 4.5);

function partChunks(script: string, format: VideoFormat) {
  const scenes = splitScript(script, Math.round(secondsPerScene(format) * WORDS_PER_SECOND));
  if (format !== "long") return [scenes.join(" ")];
  const perPart = Math.max(4, Math.round(60 / secondsPerScene(format))); // ≈ 1 minute per part
  const chunks: string[] = [];
  for (let i = 0; i < scenes.length; i += perPart) chunks.push(scenes.slice(i, i + perPart).join(" "));
  return chunks;
}

/** Step 1: title, cast, locations and a shared visual style read FROM the script (script stays untouched). */
export async function outlineFromScript(request: ScriptRequest): Promise<StoryPlan> {
  const niche = getNiche(request.niche);
  const script = cleanScript(request.script);
  const chunks = partChunks(script, request.format);
  let raw: Record<string, unknown> = {};
  let model: string | undefined;
  if (textModelAvailable()) {
    try {
      const result = await completeJson(
        "You are a film director preparing an AI-image storyboard for a narrated faceless video. You never change the script.",
        `Read this narration script and describe how it should LOOK. Keep 1–3 recurring characters and 1–6 recurring locations so every image stays consistent.
Script:
"""${script.slice(0, 6000)}"""
Return ONLY JSON: {"title":"catchy honest title under 70 chars","concept":"one sentence","isFiction":true,"setting":"world/era","visualBible":"one paragraph every image shares: art style, palette, lighting, lens",
"musicMood":"suspense|dark-ambient|romantic|emotional|uplifting|epic|curious|mysterious|playful|calm",
"characters":[{"id":"short-id","name":"...","ageRange":"...","appearance":"...","clothing":"exact outfit","hair":"...","face":"...","personality":"...","voice":"...","visualStyle":"..."}],
"locations":[{"id":"short-id","name":"...","description":"exact visual description"}],
"seo":{"title":"...","description":"2–3 sentences","hashtags":["#..."],"tags":["..."],"categoryId":"24"}}`,
        2500,
      );
      raw = result.json;
      model = result.model;
    } catch { raw = {}; }
  }
  const firstLine = splitScript(script, 12)[0] ?? script.slice(0, 120);
  const locations: LocationProfile[] = (Array.isArray(raw.locations) ? raw.locations.slice(0, 8) : []).map((item, index) => {
    const value = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const name = text(value.name, 60) || `Location ${index + 1}`;
    return { id: slug(text(value.id, 30) || name) || `loc${index + 1}`, name, description: text(value.description, 300) };
  });
  const moodRaw = text(raw.musicMood, 20).toLowerCase() as MusicMood;
  const isFiction = niche.fiction === "always" ? true : niche.fiction === "never" ? false : raw.isFiction !== false;
  const perPart = Math.round(estimateSeconds(script) / chunks.length);
  const parts: StoryPart[] = chunks.map((chunk, index) => ({ index, title: `Part ${index + 1}`, summary: chunk.slice(0, 200), targetSeconds: perPart, done: false, script: chunk }));
  const title = text(raw.title, 90) || firstLine.split(/\s+/).slice(0, 8).join(" ");
  const plan: StoryPlan = {
    version: 1, niche: niche.id, subNiche: niche.subNiches[0]?.id ?? "",
    title, hook: firstLine, concept: text(raw.concept, 400) || firstLine,
    curiosityGap: "", characters: normalizeCharacters(raw.characters), setting: text(raw.setting, 300),
    scenes: [], ending: "", musicMood: MUSIC_MOODS.includes(moodRaw) ? moodRaw : niche.musicMood,
    tone: niche.tone, isFiction,
    seo: { title: "", description: "", hashtags: [], tags: [], categoryId: niche.seo.categoryId, suggestedPublishTime: "" },
    source: model ? "ai" : "template", model, format: request.format,
    visualBible: text(raw.visualBible, 600) || `${request.style} style, ${niche.visualKeywords}`,
    locations, parts, userScript: true,
  };
  plan.seo = normalizeSeo(raw.seo, niche, plan, request.timezone);
  return plan;
}

function fallbackShot(line: string, niche: NicheDefinition, index: number): Partial<PlanScene> {
  return {
    visual: `${niche.visualKeywords}, a cinematic shot illustrating: ${line.slice(0, 220)}`,
    camera: CAMERA_MOVES[(index * 5 + 1) % CAMERA_MOVES.length],
    animation: "subtle environmental motion",
    atmosphere: [],
    transition: niche.transitions[index % niche.transitions.length],
  };
}

/** Step 2..n: turns the next part of the script into scenes. Narration = the user's words, unchanged. */
export async function writeScriptPart(plan: StoryPlan, style: VisualStyle): Promise<StoryPlan> {
  const niche = getNiche(plan.niche);
  const part = plan.parts?.find((item) => !item.done);
  if (!part || !plan.parts) return plan;
  const lines = splitScript(part.script ?? "", Math.round(secondsPerScene(plan.format ?? "short") * WORDS_PER_SECOND));
  let shots: Record<string, unknown>[] = [];
  if (textModelAvailable() && lines.length) {
    const cast = plan.characters.map((c) => `${c.id}: ${c.name}, ${c.appearance}, wearing ${c.clothing}`).join("\n");
    const places = (plan.locations ?? []).map((l) => `${l.id}: ${l.name} — ${l.description}`).join("\n");
    try {
      const { json } = await completeJson(
        "You are a film director. You design ONE AI-generated image (plus camera motion) for each line of a narration. You never rewrite the narration.",
        `Visual bible (all images): ${plan.visualBible}. Style: ${style}.
Characters (use ids):\n${cast || "none"}\nLocations (use ids):\n${places || "none"}
Narration lines:\n${lines.map((line, i) => `${i + 1}. ${line}`).join("\n")}
For EACH line (exactly ${lines.length}, same order) return ONLY JSON: {"scenes":[{"visual":"self-contained shot: place, subject, action, lighting, composition (no text in image)","characters":["id"],"location":"id","animation":"what moves","camera":"static|slow-push-in|pull-out|pan-left|pan-right|tilt-up|tilt-down|tracking|dolly-zoom|orbit|handheld|crane-up","atmosphere":["rain|fog|smoke|fire|lightning|snow|dust|particles|flicker|shadows"],"sfx":["wind|rain|thunder|heartbeat|footsteps|knock|door creak|whoosh|impact|riser|clock tick|city night|ocean waves|fire crackle|birds|chime|crowd"],"caption":"≤ 6 words","transition":"cut|fade|fadeblack|dissolve|slideleft|wipeleft|zoomin"}]}`,
        3500,
      );
      shots = Array.isArray(json.scenes) ? (json.scenes as Record<string, unknown>[]) : [];
    } catch { shots = []; }
  }
  const ids = new Set(plan.characters.map((c) => c.id));
  const locationIds = new Set((plan.locations ?? []).map((l) => l.id));
  const offset = plan.scenes.length;
  const per = secondsPerScene(plan.format ?? "short");
  const scenes: PlanScene[] = lines.map((line, i) => {
    const shot = (typeof shots[i] === "object" && shots[i] ? shots[i] : {}) as Record<string, unknown>;
    const base = fallbackShot(line, niche, offset + i);
    const camera = CAMERA_MOVES.includes(text(shot.camera, 30) as CameraMove) ? (text(shot.camera, 30) as CameraMove) : base.camera!;
    const transition = TRANSITIONS.includes(text(shot.transition, 20) as TransitionKind) ? (text(shot.transition, 20) as TransitionKind) : base.transition!;
    const atmosphere = (Array.isArray(shot.atmosphere) ? shot.atmosphere : []).map((item) => text(item, 20)).filter((item): item is AtmosphereFx => ATMOSPHERE.includes(item as AtmosphereFx)).slice(0, 3);
    const location = slug(text(shot.location, 40));
    return {
      index: offset + i,
      beat: offset + i === 0 ? "hook" : "escalation",
      duration: Math.max(2.5, Math.min(14, Math.round((words(line) / WORDS_PER_SECOND + 0.5) * 10) / 10)) || per,
      narration: line,
      dialogue: [],
      visual: text(shot.visual, 600) || base.visual!,
      characters: (Array.isArray(shot.characters) ? shot.characters : []).map((id) => slug(text(id, 30))).filter((id) => ids.has(id)),
      animation: text(shot.animation, 260) || base.animation!,
      camera, cameraNote: "",
      atmosphere,
      sfx: (Array.isArray(shot.sfx) ? shot.sfx : []).map((item) => text(item, 40)).filter(Boolean).slice(0, 3),
      musicCue: "",
      caption: text(shot.caption, 60) || line.split(/\s+/).slice(0, 6).join(" "),
      transition,
      part: part.index,
      location: locationIds.has(location) ? location : undefined,
    };
  });
  return { ...plan, scenes: [...plan.scenes, ...scenes], parts: plan.parts.map((item) => (item.index === part.index ? { ...item, done: true } : item)) };
}
