import { hookGuidance, scoreHook, STRATEGY_RULES } from "@/content/hooks";
import { getNiche, type NicheDefinition } from "@/content/niches/registry";
import { completeJson, textModelAvailable, textModelConfigured } from "@/content/story-engine/llm";
import { normalizePlan, sceneCountFor, WORDS_PER_SECOND } from "@/content/story-engine/normalize";
import { createTemplatePlan } from "@/content/story-engine/template";
import type { StoryPlan, VisualStyle } from "@/content/types";

export type StoryRequest = {
  niche: string;
  subNiche?: string;
  idea?: string;
  targetDuration: number;
  style: VisualStyle;
  maxScenes: number;
  timezone: string;
  voiceGender?: "female" | "male" | "auto";
  avoidTitles?: string[];
  aspect?: "9:16" | "16:9";
};

const SFX_VOCAB = "wind, rain, thunder, heartbeat, footsteps, knock, door creak, whoosh, impact, riser, electrical hum, clock tick, phone ring, phone vibrate, glitch, city night, ocean waves, fire crackle, birds, chime, soft rain, crowd";

function schemaHint(sceneCount: number) {
  return `Return ONLY JSON (no markdown) shaped exactly like:
{"title":"...","hook":"first line spoken, max 16 words","concept":"one sentence","curiosityGap":"what question the viewer needs answered",
"isFiction":true,"tone":"...","setting":"...","musicMood":"suspense|dark-ambient|romantic|emotional|uplifting|epic|curious|mysterious|playful|calm",
"characters":[{"id":"short-id","name":"...","ageRange":"...","appearance":"body, skin, build","clothing":"exact outfit","hair":"...","face":"distinctive facial features","personality":"...","voice":"...","visualStyle":"..."}],
"scenes":[{"beat":"hook|setup|escalation|twist|payoff|ending|loop","duration":4,"narration":"spoken words","dialogue":[{"speaker":"id","line":"..."}],
"visual":"self-contained shot description: place, subject, action, lighting","characters":["short-id"],
"animation":"what MOVES: character action, expression, hair/clothes, environment (rain, fog, flames, shadows)",
"camera":"static|slow-push-in|pull-out|pan-left|pan-right|tilt-up|tilt-down|tracking|dolly-zoom|orbit|handheld|crane-up","cameraNote":"...",
"atmosphere":["rain|fog|smoke|fire|lightning|snow|dust|particles|flicker|shadows"],"sfx":["from: ${SFX_VOCAB}"],"musicCue":"...","caption":"short on-screen caption","transition":"cut|fade|fadeblack|dissolve|slideleft|slideup|circleopen|wipeleft|zoomin"}],
"ending":"...","loopLine":"optional",
"seo":{"title":"honest curiosity title under 70 chars","description":"2-3 sentences","hashtags":["#..."],"tags":["..."],"categoryId":"24","suggestedPublishTime":"HH:mm"}}
Exactly ${sceneCount} scenes.`;
}

function buildPrompt(niche: NicheDefinition, request: StoryRequest, sceneCount: number) {
  const sub = niche.subNiches.find((item) => item.id === request.subNiche)?.label ?? request.subNiche ?? "writer's choice";
  const words = Math.round(request.targetDuration * WORDS_PER_SECOND);
  const system = [
    "You are the head writer and director of a faceless YouTube Shorts channel. You write ORIGINAL short scripts and shot lists for AI video generation.",
    ...STRATEGY_RULES,
    `Niche: ${niche.label}. Tone: ${niche.tone}. Rules: ${niche.storyRules}`,
    niche.fiction === "never" ? "This niche is FACTUAL: every claim must be accurate and well established. If unsure, choose a different, well-documented topic." : "This is ORIGINAL FICTION. Never present it as a real event.",
    "Visual descriptions are sent directly to a text-to-video model: each must stand alone (repeat the character's key look in every shot they appear in), describe motion, avoid text/logos on screen, and avoid gore or sexual content.",
    "Keep 1–2 main characters maximum so they stay consistent across shots.",
  ].join("\n");
  const user = [
    `Write a ${request.targetDuration}-second ${request.aspect === "16:9" ? "widescreen 16:9" : "vertical"} Short. Sub-niche: ${sub}.`,
    request.idea ? `User idea: ${request.idea}` : "Pick a fresh, specific concept yourself.",
    `Visual style: ${request.style}; look: ${niche.visualKeywords}.`,
    `Narration total about ${words} words (≈${WORDS_PER_SECOND} words/second). The hook scene narration must be ≤ 3 seconds.`,
    request.voiceGender && request.voiceGender !== "auto" ? `Narrator voice: ${request.voiceGender}.` : "",
    request.avoidTitles?.length ? `Avoid repeating these recent titles/concepts: ${request.avoidTitles.slice(0, 12).join("; ")}.` : "",
    hookGuidance(niche),
    schemaHint(sceneCount),
  ].filter(Boolean).join("\n");
  return { system, user };
}

export async function generateStoryPlan(request: StoryRequest): Promise<{ plan: StoryPlan; note: string | null }> {
  const niche = getNiche(request.niche);
  const subNiche = request.subNiche && niche.subNiches.some((item) => item.id === request.subNiche) ? request.subNiche : niche.subNiches[0]?.id ?? "";
  const sceneCount = sceneCountFor(request.targetDuration, request.maxScenes);
  if (textModelConfigured() || (niche.fiction !== "never" && textModelAvailable())) {
    try {
      const { system, user } = buildPrompt(niche, { ...request, subNiche }, sceneCount);
      const { json, model } = await completeJson(system, user);
      return { plan: normalizePlan(json, niche, subNiche, request.targetDuration, request.maxScenes, request.timezone, "ai", model), note: null };
    } catch (error) {
      if (niche.fiction === "never") throw error;
      const plan = normalizePlan(createTemplatePlan(niche, subNiche, request.idea ?? ""), niche, subNiche, request.targetDuration, request.maxScenes, request.timezone, "template");
      return { plan, note: `Story model unavailable (${error instanceof Error ? error.message : "error"}); used the built-in template writer.` };
    }
  }
  const plan = normalizePlan(createTemplatePlan(niche, subNiche, request.idea ?? ""), niche, subNiche, request.targetDuration, request.maxScenes, request.timezone, "template");
  return { plan, note: "No story model key configured (GROQ_API_KEY, GEMINI_API_KEY or OPENROUTER_API_KEY); used the built-in template writer." };
}

export type IdeaCandidate = { niche: string; subNiche: string; idea: string; hook: string; score: number };

/** Autopilot step 1–2: generate ideas and keep the strongest distinct ones. */
export async function generateIdeas(nicheId: string, count: number, avoidTitles: string[]): Promise<IdeaCandidate[]> {
  const niche = getNiche(nicheId);
  const want = Math.max(1, Math.min(20, count));
  if (textModelConfigured() || (niche.fiction !== "never" && textModelAvailable())) {
    try {
      const { json } = await completeJson(
        `You are a YouTube Shorts content strategist for the niche "${niche.label}" (${niche.tone}). ${niche.storyRules} Ideas must be ORIGINAL, not retellings of existing creators' stories. ${niche.fiction === "never" ? "Only well-documented, accurate topics." : "Fiction only."}`,
        `Give ${want + 4} distinct Short ideas. ${hookGuidance(niche)} Avoid: ${avoidTitles.slice(0, 15).join("; ") || "none"}.
Return ONLY JSON: {"ideas":[{"subNiche":"one of ${niche.subNiches.map((item) => item.id).join("|")}","idea":"one-sentence concept","hook":"opening line ≤16 words"}]}`,
        1500,
      );
      const raw = Array.isArray(json.ideas) ? json.ideas : [];
      const ideas = raw.map((item) => {
        const value = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
        const hook = String(value.hook ?? "").slice(0, 160);
        const sub = String(value.subNiche ?? "");
        return { niche: niche.id, subNiche: niche.subNiches.some((entry) => entry.id === sub) ? sub : niche.subNiches[0]?.id ?? "", idea: String(value.idea ?? "").slice(0, 300), hook, score: scoreHook(hook) };
      }).filter((item) => item.idea.length > 10);
      const unique = ideas.filter((item, index) => ideas.findIndex((other) => other.idea.toLowerCase() === item.idea.toLowerCase()) === index);
      if (unique.length) return unique.sort((a, b) => b.score - a.score).slice(0, want);
    } catch { /* fall through to template seeds */ }
  }
  if (niche.fiction === "never") throw new Error(`${niche.label} needs a story model key (Groq, Gemini or OpenRouter) for idea generation (facts can't come from templates).`);
  return Array.from({ length: want }, (_, index) => ({ niche: niche.id, subNiche: niche.subNiches[index % Math.max(1, niche.subNiches.length)]?.id ?? "", idea: "", hook: "", score: 0 }));
}
