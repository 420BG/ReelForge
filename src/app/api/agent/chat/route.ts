import { getNiche, NICHES } from "@/content/niches/registry";
import { generateStoryPlan } from "@/content/story-engine";
import type { VisualStyle } from "@/content/types";
import { fail, guard } from "@/jobs/api-helpers";
import { createVideo, getConfig, getVideo, normalizeVideoSettings, recentTitles } from "@/jobs/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* Reads a plain-language request ("Create a 1 minute cinematic video about discipline")
   into niche / length / style, writes the storyboard, and returns it as a draft to review. */

const NICHE_WORDS: [RegExp, string][] = [
  [/\b(horror|scary|creepy|haunt|ghost|paranormal|3\s?am|nightmare|urban legend)/i, "horror"],
  [/\b(love|romance|romantic|relationship|breakup|crush|heartbreak|couple)/i, "love"],
  [/\b(mystery|mysterious|disappear|unsolved|clue|detective|secret)/i, "mystery"],
  [/\b(motivat|discipline|success|habit|mindset|comeback|grind|inspir)/i, "motivation"],
  [/\b(psycholog|brain|bias|behavio|why we|why people|mind)/i, "psychology"],
  [/\b(science|space|planet|black hole|ocean|physics|body|universe|ai\b|technology|future)/i, "science"],
  [/\b(history|historical|ancient|empire|roman|egypt|war|medieval)/i, "history"],
  [/\b(weird|strange|bizarre|unusual|odd fact|creepy fact)/i, "weird"],
  [/\b(kids?|children|bedtime|cartoon for kids)/i, "kids"],
  [/\b(sci-?fi|fantasy|dystopian|thriller|fiction|story about a|dragon|robot)/i, "fiction"],
];

function parseDuration(text: string) {
  const minutes = /(\d+(?:\.\d+)?)\s*(?:-|\s)?(?:min|minute)/i.exec(text);
  if (minutes) return Math.round(Number(minutes[1]) * 60);
  if (/\b(one|a)\s+minute/i.test(text)) return 60;
  const seconds = /(\d{2})\s*(?:-|\s)?(?:s\b|sec|second)/i.exec(text);
  if (seconds) return Number(seconds[1]);
  return 30;
}

function parseStyle(text: string, fallback: VisualStyle): VisualStyle {
  if (/anime/i.test(text)) return "anime";
  if (/\b3d\b|pixar|animated|animation/i.test(text)) return "animation-3d";
  if (/realistic|documentary|real footage/i.test(text)) return "realistic";
  if (/dark|horror|creepy/i.test(text)) return "dark-cinematic";
  if (/storybook|kids/i.test(text)) return "storybook";
  if (/cinematic|movie|film/i.test(text)) return "cinematic";
  return fallback;
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 600) : "";
    if (message.length < 4) return Response.json({ error: "Tell me what the video should be about." }, { status: 400 });
    const nicheId = NICHE_WORDS.find(([pattern]) => pattern.test(message))?.[1] ?? (typeof body.niche === "string" && NICHES.some((n) => n.id === body.niche) ? body.niche : "motivation");
    const niche = getNiche(nicheId);
    const targetDuration = [15, 30, 45, 60].reduce((best, n) => (Math.abs(n - parseDuration(message)) < Math.abs(best - parseDuration(message)) ? n : best), 30);
    const config = await getConfig();
    const settings = normalizeVideoSettings({
      targetDuration,
      style: parseStyle(message, niche.defaultStyle),
      voiceGender: /\bfemale|woman\b/i.test(message) ? "female" : /\bmale|man\b/i.test(message) ? "male" : "auto",
      idea: message,
      audience: niche.audience,
      allowImageMode: config.allowImageMode,
    });
    const { plan, note } = await generateStoryPlan({
      niche: niche.id, idea: message, targetDuration: settings.targetDuration, style: settings.style,
      maxScenes: config.maxScenesPerVideo, timezone: config.timezone, voiceGender: settings.voiceGender, avoidTitles: await recentTitles(20),
    });
    const created = await createVideo({ niche: niche.id, subNiche: plan.subNiche, settings, story: plan, audience: niche.audience });
    const video = await getVideo(created.id);
    const reply = `Here's the plan for a ${settings.targetDuration}-second ${niche.label.toLowerCase()} Short: “${plan.title}”. ${plan.scenes.length} scenes, ${settings.style.replace("-", " ")} style, ${settings.voiceGender === "auto" ? "narrator matched to the niche" : `${settings.voiceGender} narrator`}. Review it, then press Produce.`;
    return Response.json({ reply, note, video }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
