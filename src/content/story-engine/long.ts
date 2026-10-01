import { STRATEGY_RULES } from "@/content/hooks";
import { getNiche, type NicheDefinition } from "@/content/niches/registry";
import { normalizeSeo } from "@/content/seo";
import { completeJson, textModelAvailable, textModelConfigured } from "@/content/story-engine/llm";
import { MUSIC_MOODS, normalizeCharacters, normalizeScenes, WORDS_PER_SECOND } from "@/content/story-engine/normalize";
import type { LocationProfile, MusicMood, StoryPart, StoryPlan, VisualStyle } from "@/content/types";

/**
 * Long-form (16:9, several minutes) stories are written in two phases so nothing is lost
 * when a provider runs out mid-way:
 *   1) outline: title, cast, recurring locations, one shared "visual bible", and N parts;
 *   2) one call per part → that part's scenes, appended to the saved plan.
 * The pipeline calls these one at a time and saves after each, so a quota error only
 * retries the missing part (with the next provider in the chain).
 */

export type LongRequest = { aspect?: "9:16" | "16:9"; niche: string; subNiche?: string; idea?: string; targetDuration: number; style: VisualStyle; timezone: string; voiceGender?: "female" | "male" | "auto"; avoidTitles?: string[] };

/** ~9 s per image keeps AI image generations low (one image per scene) while staying dynamic. */
export const SECONDS_PER_SCENE = 9;

export function partCount(targetSeconds: number) {
  return Math.max(2, Math.min(10, Math.round(targetSeconds / 60)));
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

export function canWriteLong(nicheId: string) {
  const niche = getNiche(nicheId);
  return textModelConfigured() || (niche.fiction !== "never" && textModelAvailable());
}

function system(niche: NicheDefinition) {
  return [
    "You are the head writer and director of a faceless YouTube channel that makes LONG-FORM narrated videos (several minutes). Every scene becomes ONE AI-generated image that is animated, so describe shots precisely.",
    ...STRATEGY_RULES,
    `Niche: ${niche.label}. Tone: ${niche.tone}. Rules: ${niche.storyRules}`,
    niche.fiction === "never" ? "This niche is FACTUAL: every claim must be accurate and well established. If unsure, choose a different, well-documented topic." : "This is ORIGINAL FICTION. Never present it as a real event.",
    "Consistency matters more than variety: 1–3 main characters, 2–6 recurring locations, one visual style for the whole video. Repeat each character's key look in every shot they appear in.",
    "No gore, no sexual content, no text or logos in images.",
  ].join("\n");
}

export async function generateLongOutline(request: LongRequest): Promise<StoryPlan> {
  const niche = getNiche(request.niche);
  const sub = niche.subNiches.find((item) => item.id === request.subNiche)?.id ?? niche.subNiches[0]?.id ?? "";
  const parts = partCount(request.targetDuration);
  const minutes = Math.round(request.targetDuration / 60);
  const user = [
    `Plan a ${minutes}-minute narrated YouTube video (${request.aspect === "9:16" ? "vertical 9:16" : "widescreen 16:9"}). Sub-niche: ${niche.subNiches.find((item) => item.id === sub)?.label ?? sub}.`,
    request.idea ? `User idea: ${request.idea}` : "Pick a fresh, specific, gripping concept yourself.",
    `Visual style: ${request.style}; look: ${niche.visualKeywords}.`,
    request.voiceGender && request.voiceGender !== "auto" ? `Narrator voice: ${request.voiceGender}.` : "",
    request.avoidTitles?.length ? `Avoid these recent titles/concepts: ${request.avoidTitles.slice(0, 12).join("; ")}.` : "",
    `Split it into exactly ${parts} parts that build tension and pay off (part 1 opens with a strong hook, the last part resolves it).`,
    `Return ONLY JSON:
{"title":"...","hook":"first spoken line, ≤ 18 words","concept":"one sentence","curiosityGap":"...","isFiction":true,"tone":"...","setting":"overall world/era",
"visualBible":"ONE paragraph every image shares: art style, color palette, lighting, lens, era, texture",
"musicMood":"suspense|dark-ambient|romantic|emotional|uplifting|epic|curious|mysterious|playful|calm",
"characters":[{"id":"short-id","name":"...","ageRange":"...","appearance":"body, skin, build","clothing":"exact outfit","hair":"...","face":"distinctive features","personality":"...","voice":"...","visualStyle":"..."}],
"locations":[{"id":"short-id","name":"...","description":"exact visual description reused in every shot there"}],
"parts":[{"title":"...","summary":"2–3 sentences: what happens in this part"}],
"ending":"...","seo":{"title":"honest curiosity title under 70 chars","description":"3–4 sentences","hashtags":["#..."],"tags":["..."],"categoryId":"24"}}`,
  ].filter(Boolean).join("\n");
  const { json, model } = await completeJson(system(niche), user, 3000);
  const characters = normalizeCharacters(json.characters);
  const locations: LocationProfile[] = (Array.isArray(json.locations) ? json.locations.slice(0, 8) : []).map((item, index) => {
    const value = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const name = text(value.name, 60) || `Location ${index + 1}`;
    return { id: slug(text(value.id, 30) || name) || `loc${index + 1}`, name, description: text(value.description, 300) };
  });
  // Models sometimes return fewer parts, plain strings, or put them under another key — accept all of that.
  const listed = [json.parts, json.chapters, json.acts, json.sections].find((value) => Array.isArray(value) && value.length) as unknown[] | undefined;
  const rawParts: Record<string, unknown>[] = (listed ?? []).slice(0, parts).map((item) => (typeof item === "string" ? { summary: item } : typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {}));
  if (!text(json.title, 90) && !rawParts.length) throw new Error("The outline came back empty.");
  while (rawParts.length < parts) {
    const n = rawParts.length;
    rawParts.push({ title: n === parts - 1 ? "The ending" : `Part ${n + 1}`, summary: n === parts - 1 ? `Resolve the story: ${text(json.ending, 300) || "a satisfying final payoff"}.` : `Continue the story and raise the stakes (part ${n + 1} of ${parts}).` });
  }
  const per = Math.round(request.targetDuration / rawParts.length);
  const storyParts: StoryPart[] = rawParts.map((value, index) => ({ index, title: text(value.title ?? value.name, 80) || `Part ${index + 1}`, summary: text(value.summary ?? value.description ?? value.plot, 500), targetSeconds: per, done: false }));
  const isFiction = niche.fiction === "always" ? true : niche.fiction === "never" ? false : json.isFiction !== false;
  const moodRaw = text(json.musicMood, 20).toLowerCase() as MusicMood;
  const title = text(json.title, 90) || "Untitled";
  const plan: StoryPlan = {
    version: 1,
    niche: niche.id,
    subNiche: sub,
    title,
    hook: text(json.hook, 200),
    concept: text(json.concept, 400),
    curiosityGap: text(json.curiosityGap, 200),
    characters,
    setting: text(json.setting, 300),
    scenes: [],
    ending: text(json.ending, 300),
    musicMood: MUSIC_MOODS.includes(moodRaw) ? moodRaw : niche.musicMood,
    tone: text(json.tone, 120) || niche.tone,
    isFiction,
    seo: { title: "", description: "", hashtags: [], tags: [], categoryId: niche.seo.categoryId, suggestedPublishTime: "" },
    source: "ai",
    model,
    format: "long",
    aspect: request.aspect ?? "16:9",
    visualBible: text(json.visualBible, 600),
    locations,
    parts: storyParts,
  };
  plan.seo = normalizeSeo(json.seo, niche, plan, request.timezone);
  return plan;
}

/** Writes the next unfinished part and returns the updated plan (scenes appended, part marked done). */
export async function generateNextPart(plan: StoryPlan, request: Pick<LongRequest, "style">): Promise<StoryPlan> {
  const niche = getNiche(plan.niche);
  const part = plan.parts?.find((item) => !item.done);
  if (!part || !plan.parts) return plan;
  const total = plan.parts.length;
  const sceneCount = Math.max(3, Math.min(14, Math.round(part.targetSeconds / SECONDS_PER_SCENE)));
  const words = Math.round(part.targetSeconds * WORDS_PER_SECOND);
  const previous = plan.parts.filter((item) => item.index < part.index).map((item) => `Part ${item.index + 1} "${item.title}": ${item.summary}`).join("\n");
  const cast = plan.characters.map((c) => `${c.id}: ${c.name}, ${c.appearance}, wearing ${c.clothing}`).join("\n");
  const places = (plan.locations ?? []).map((l) => `${l.id}: ${l.name} — ${l.description}`).join("\n");
  const user = [
    `Video: "${plan.title}" — ${plan.concept}`,
    `Visual bible (all images): ${plan.visualBible || plan.setting}. Style: ${request.style}.`,
    `Characters (use these ids):\n${cast || "none"}`,
    `Locations (use these ids):\n${places || "none"}`,
    previous ? `Already written:\n${previous}` : "",
    `Now write PART ${part.index + 1} of ${total}: "${part.title}" — ${part.summary}`,
    part.index === 0 ? `Scene 1 narration must open with this hook: "${plan.hook}".` : "Continue seamlessly from the previous part (no recap, no new intro).",
    part.index === total - 1 ? `End the video: ${plan.ending || "resolve the story with a satisfying final line"}.` : "End this part on a small cliffhanger that pulls into the next part.",
    `About ${words} words of narration total (${WORDS_PER_SECOND} words/second), spread over exactly ${sceneCount} scenes (each ≈ ${SECONDS_PER_SCENE} s, one image each).`,
    `Return ONLY JSON: {"scenes":[{"beat":"hook|setup|escalation|twist|payoff|ending","duration":${SECONDS_PER_SCENE},"narration":"spoken words","dialogue":[],
"visual":"self-contained shot: place, subject, action, lighting, composition","characters":["id"],"location":"location-id",
"animation":"what moves in the shot","camera":"static|slow-push-in|pull-out|pan-left|pan-right|tilt-up|tilt-down|tracking|dolly-zoom|orbit|handheld|crane-up","cameraNote":"...",
"atmosphere":["rain|fog|smoke|fire|lightning|snow|dust|particles|flicker|shadows"],"sfx":["wind|rain|thunder|heartbeat|footsteps|knock|door creak|whoosh|impact|riser|clock tick|city night|ocean waves|fire crackle|birds|chime|crowd"],
"caption":"short caption","transition":"cut|fade|fadeblack|dissolve|slideleft|wipeleft|zoomin"}]}`,
  ].filter(Boolean).join("\n");
  const { json } = await completeJson(system(niche), user, 4000);
  const locationIds = new Set((plan.locations ?? []).map((item) => item.id));
  const nested = typeof json.part === "object" && json.part !== null ? (json.part as Record<string, unknown>).scenes : undefined;
  const rawScenes = ([json.scenes, nested, json.shots].find((value) => Array.isArray(value)) as unknown[] | undefined) ?? [];
  const offset = plan.scenes.length;
  const scenes = normalizeScenes(rawScenes, plan.characters, niche, part.targetSeconds, 16).map((scene, i) => {
    const raw = (rawScenes[i] ?? {}) as Record<string, unknown>;
    const location = slug(text(raw.location, 40));
    return { ...scene, index: offset + i, part: part.index, location: locationIds.has(location) ? location : undefined, beat: part.index === 0 && i === 0 ? "hook" as const : scene.beat };
  });
  if (scenes.length < 2) throw new Error(`Part ${part.index + 1} came back with too few scenes.`);
  return {
    ...plan,
    scenes: [...plan.scenes, ...scenes],
    parts: plan.parts.map((item) => (item.index === part.index ? { ...item, done: true } : item)),
  };
}

export function storyComplete(plan: StoryPlan | null | undefined) {
  return Boolean(plan?.scenes?.length) && (!plan?.parts || plan.parts.every((part) => part.done));
}
