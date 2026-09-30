import type { NicheDefinition } from "@/content/niches/registry";
import { normalizeSeo } from "@/content/seo";
import type {
  AtmosphereFx, CameraMove, CharacterProfile, MusicMood, PlanScene, SceneBeat, StoryPlan, TransitionKind,
} from "@/content/types";

export const CAMERA_MOVES: CameraMove[] = ["static", "slow-push-in", "pull-out", "pan-left", "pan-right", "tilt-up", "tilt-down", "tracking", "dolly-zoom", "orbit", "handheld", "crane-up"];
export const ATMOSPHERE: AtmosphereFx[] = ["rain", "fog", "smoke", "fire", "lightning", "snow", "dust", "particles", "flicker", "shadows"];
export const TRANSITIONS: TransitionKind[] = ["cut", "fade", "fadeblack", "dissolve", "slideleft", "slideup", "circleopen", "wipeleft", "zoomin"];
export const BEATS: SceneBeat[] = ["hook", "setup", "escalation", "twist", "payoff", "ending", "loop"];
export const MUSIC_MOODS: MusicMood[] = ["suspense", "dark-ambient", "romantic", "emotional", "uplifting", "epic", "curious", "mysterious", "playful", "calm"];

/** Average narration speed used for planning (words per second). */
export const WORDS_PER_SECOND = 2.5;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function sceneCountFor(targetSeconds: number, maxScenes: number) {
  return Math.max(3, Math.min(maxScenes, Math.round(targetSeconds / 4.8)));
}

function fuzzyCamera(value: unknown): CameraMove {
  const raw = text(value, 60).toLowerCase();
  if (CAMERA_MOVES.includes(raw as CameraMove)) return raw as CameraMove;
  if (/push|dolly in|zoom in|creep/.test(raw)) return "slow-push-in";
  if (/pull|zoom out|dolly out|reveal wide/.test(raw)) return "pull-out";
  if (/pan.*left/.test(raw)) return "pan-left";
  if (/pan/.test(raw)) return "pan-right";
  if (/tilt.*down/.test(raw)) return "tilt-down";
  if (/tilt|look up/.test(raw)) return "tilt-up";
  if (/track|follow/.test(raw)) return "tracking";
  if (/vertigo|dolly zoom/.test(raw)) return "dolly-zoom";
  if (/orbit|circle|arc/.test(raw)) return "orbit";
  if (/hand|shaky|pov/.test(raw)) return "handheld";
  if (/crane|rise|drone/.test(raw)) return "crane-up";
  return "static";
}

function pickList<T extends string>(value: unknown, allowed: readonly T[], max: number): T[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,+]/) : [];
  return Array.from(new Set(list.map((item) => text(item, 30).toLowerCase()).filter((item): item is T => allowed.includes(item as T)))).slice(0, max);
}

function seedFrom(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return Math.abs(hash) % 2_000_000_000;
}

export function normalizeCharacters(raw: unknown): CharacterProfile[] {
  const list = Array.isArray(raw) ? raw.slice(0, 4) : [];
  return list.map((item, index) => {
    const value = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const name = text(value.name, 40) || `Character ${index + 1}`;
    const id = (text(value.id, 30) || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `c${index + 1}`;
    return {
      id,
      name,
      ageRange: text(value.ageRange, 30) || "adult",
      appearance: text(value.appearance, 220),
      clothing: text(value.clothing, 160),
      hair: text(value.hair, 100),
      face: text(value.face, 140),
      personality: text(value.personality, 140),
      voice: text(value.voice, 80),
      visualStyle: text(value.visualStyle, 120),
      referenceSeed: Number.isFinite(Number(value.referenceSeed)) ? Math.abs(Math.round(Number(value.referenceSeed))) % 2_000_000_000 : seedFrom(`${id}:${name}`),
    };
  });
}

/** Distributes planned durations so the scenes add up to the target length. */
export function balanceDurations(scenes: PlanScene[], targetSeconds: number) {
  const words = scenes.map((scene) => Math.max(3, scene.narration.split(/\s+/).filter(Boolean).length));
  const totalWords = words.reduce((sum, count) => sum + count, 0);
  return scenes.map((scene, index) => {
    const share = (words[index] / totalWords) * targetSeconds;
    const byWords = words[index] / WORDS_PER_SECOND + 0.6;
    const duration = Math.max(2.5, Math.min(12, Math.round(((share + byWords) / 2) * 10) / 10));
    return { ...scene, duration };
  });
}

/** Drops middle escalation scenes when the narration clearly can't fit the target length (keeps hook, payoff, ending). */
export function fitToTarget(scenes: PlanScene[], targetSeconds: number) {
  const words = (list: PlanScene[]) => list.reduce((sum, scene) => sum + scene.narration.split(/\s+/).filter(Boolean).length, 0);
  const budget = targetSeconds * WORDS_PER_SECOND * 1.15;
  const kept = [...scenes];
  while (kept.length > 3 && words(kept) > budget) {
    const candidates = kept.map((scene, i) => ({ scene, i })).filter(({ scene, i }) => i > 0 && i < kept.length - 1 && (scene.beat === "escalation" || scene.beat === "setup"));
    const drop = candidates.length ? candidates[Math.floor(candidates.length / 2)].i : kept.length - 2;
    if (drop <= 0) break;
    kept.splice(drop, 1);
  }
  return kept.map((scene, index) => ({ ...scene, index }));
}

export function normalizeScenes(raw: unknown, characters: CharacterProfile[], niche: NicheDefinition, targetSeconds: number, maxScenes: number): PlanScene[] {
  const list = Array.isArray(raw) ? raw.slice(0, maxScenes) : [];
  const ids = new Set(characters.map((character) => character.id));
  const scenes: PlanScene[] = list.map((item, index) => {
    const value = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const beatRaw = text(value.beat, 20).toLowerCase() as SceneBeat;
    const beat: SceneBeat = BEATS.includes(beatRaw) ? beatRaw : index === 0 ? "hook" : index === list.length - 1 ? "ending" : index === 1 ? "setup" : "escalation";
    const transitionRaw = text(value.transition, 20).toLowerCase() as TransitionKind;
    const dialogue = Array.isArray(value.dialogue)
      ? value.dialogue.slice(0, 3).map((line) => {
          const entry = (typeof line === "object" && line !== null ? line : {}) as Record<string, unknown>;
          return { speaker: text(entry.speaker, 30), line: text(entry.line, 140) };
        }).filter((line) => line.line)
      : [];
    const narration = text(value.narration, 320);
    const sceneCharacters = (Array.isArray(value.characters) ? value.characters : [])
      .map((id) => text(id, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-"))
      .filter((id) => ids.has(id));
    return {
      index,
      beat,
      duration: Number(value.duration) || 4,
      narration,
      dialogue,
      visual: text(value.visual ?? value.visualPrompt, 600) || `${niche.visualKeywords}`,
      characters: sceneCharacters,
      animation: text(value.animation, 260) || "subtle environmental motion, drifting particles",
      camera: fuzzyCamera(value.camera),
      cameraNote: text(value.cameraNote ?? value.camera, 140),
      atmosphere: pickList(value.atmosphere, ATMOSPHERE, 3),
      sfx: (Array.isArray(value.sfx) ? value.sfx : typeof value.sfx === "string" ? value.sfx.split(/[,+]/) : []).map((item) => text(item, 40)).filter(Boolean).slice(0, 4),
      musicCue: text(value.musicCue ?? value.music, 80),
      caption: text(value.caption, 90) || narration.slice(0, 90),
      transition: TRANSITIONS.includes(transitionRaw) ? transitionRaw : niche.transitions[index % niche.transitions.length],
      onScreenText: text(value.onScreenText, 40) || undefined,
    };
  }).filter((scene) => scene.narration || scene.visual);
  return balanceDurations(fitToTarget(scenes, targetSeconds), targetSeconds);
}

export function normalizePlan(raw: Record<string, unknown>, niche: NicheDefinition, subNiche: string, targetSeconds: number, maxScenes: number, timezone: string, source: StoryPlan["source"], model?: string): StoryPlan {
  const characters = normalizeCharacters(raw.characters);
  const scenes = normalizeScenes(raw.scenes, characters, niche, targetSeconds, maxScenes);
  if (scenes.length < 2) throw new Error("The story plan had too few usable scenes.");
  const isFiction = niche.fiction === "always" ? true : niche.fiction === "never" ? false : raw.isFiction !== false;
  const title = text(raw.title, 90) || "Untitled Short";
  const hook = text(raw.hook, 200) || scenes[0].narration;
  const concept = text(raw.concept, 400);
  const moodRaw = text(raw.musicMood, 20).toLowerCase() as MusicMood;
  const plan: StoryPlan = {
    version: 1,
    niche: niche.id,
    subNiche,
    title,
    hook,
    concept,
    curiosityGap: text(raw.curiosityGap, 200),
    characters,
    setting: text(raw.setting, 300),
    scenes,
    ending: text(raw.ending, 240) || scenes[scenes.length - 1].narration,
    loopLine: text(raw.loopLine, 160) || undefined,
    musicMood: MUSIC_MOODS.includes(moodRaw) ? moodRaw : niche.musicMood,
    tone: text(raw.tone, 120) || niche.tone,
    isFiction,
    seo: { title: "", description: "", hashtags: [], tags: [], categoryId: niche.seo.categoryId, suggestedPublishTime: "" },
    source,
    model,
  };
  plan.seo = normalizeSeo(raw.seo, niche, plan, timezone);
  return plan;
}
