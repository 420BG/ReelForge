import { getNiche, NICHES } from "@/content/niches/registry";
import { generateStoryPlan } from "@/content/story-engine";
import { completeJson, textModelAvailable } from "@/content/story-engine/llm";
import { aspectOf, type Aspect, type VisualStyle } from "@/content/types";
import { fail, guard } from "@/jobs/api-helpers";
import { createVideo, enqueueJob, getConfig, getVideo, normalizeVideoSettings, recentTitles } from "@/jobs/repo";
import { continueInBackground } from "@/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * AI Chat. A normal conversational assistant (uses the free model chain) that can ALSO make videos:
 *  - "make a 30s horror short about…"  → story-mode draft storyboard (review, then Produce)
 *  - "make a 5 minute video about…"    → long video queued
 *  - a pasted script + "use this"      → SCRIPT MODE (your words, unchanged) queued
 * Anything else is just answered, like any chat assistant.
 */

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
const STYLES: VisualStyle[] = ["cinematic", "dark-cinematic", "animation-3d", "anime", "realistic", "storybook"];

function parseDuration(text: string) {
  const minutes = /(\d+(?:\.\d+)?)\s*(?:-|\s)?(?:min|minute)/i.exec(text);
  if (minutes) return Math.round(Number(minutes[1]) * 60);
  if (/\b(one|a)\s+minute/i.test(text)) return 60;
  const seconds = /(\d{2,3})\s*(?:-|\s)?(?:s\b|sec|second)/i.exec(text);
  if (seconds) return Number(seconds[1]);
  return 0;
}

/** "16:9", "landscape", "widescreen" → 16:9; "9:16", "vertical", "portrait" → 9:16. */
function parseAspect(text: string): Aspect | undefined {
  if (/\b16\s*[:x×/]\s*9\b|landscape|horizontal|widescreen|wide screen/i.test(text)) return "16:9";
  if (/\b9\s*[:x×/]\s*16\b|vertical|portrait|tiktok|reels?\b/i.test(text)) return "9:16";
  return undefined;
}
const asAspect = (value: unknown): Aspect | undefined => (value === "9:16" || value === "16:9" ? value : undefined);
const shape = (aspect: Aspect) => (aspect === "16:9" ? "16:9 widescreen" : "9:16 vertical");

function parseStyle(text: string, fallback: VisualStyle): VisualStyle {
  if (/anime/i.test(text)) return "anime";
  if (/\b3d\b|pixar|animated|animation/i.test(text)) return "animation-3d";
  if (/realistic|documentary|real footage/i.test(text)) return "realistic";
  if (/dark|horror|creepy/i.test(text)) return "dark-cinematic";
  if (/storybook|kids/i.test(text)) return "storybook";
  if (/cinematic|movie|film/i.test(text)) return "cinematic";
  return fallback;
}

/** Pulls the script body out of "Make a video from this script: <script>". */
function extractScript(message: string) {
  const match = /^[^\n]{0,160}?(?:script|narration|story|text)\s*(?:below|here|is)?\s*[:\-—]\s*\n?([\s\S]{40,})$/i.exec(message.trim());
  if (match) return match[1].trim();
  const lines = message.trim().split("\n");
  if (lines.length > 2 && lines[0].split(/\s+/).length < 25 && /\b(make|create|use|turn|video|script)\b/i.test(lines[0])) return lines.slice(1).join("\n").trim();
  return message.trim();
}

type Turn = { role: "user" | "agent"; text: string };
type Decision = { reply: string; action: "none" | "short" | "long" | "script"; niche?: string; idea?: string; seconds?: number; style?: string; voice?: string; aspect?: Aspect };

async function decide(message: string, history: Turn[]): Promise<Decision | null> {
  if (!textModelAvailable()) return null;
  const niches = NICHES.map((n) => `${n.id} (${n.label})`).join(", ");
  const transcript = history.slice(-10).map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text.slice(0, 800)}`).join("\n");
  try {
    const { json } = await completeJson(
      [
        "You are ReelForge AI, a friendly and knowledgeable assistant inside a faceless YouTube video studio.",
        "Chat naturally like a helpful AI assistant: answer questions, brainstorm ideas, write or improve scripts and hooks, explain YouTube growth, SEO and the app. Be concise and warm; use plain text (no markdown tables).",
        "You can also START a video, but ONLY when the user clearly asks to make/create/generate/produce a video now.",
        `Actions: "short" = a story video up to 60 s; "long" = a multi-minute story video (1–15 min, written in parts); "script" = the user supplied their own narration script and wants a video made from it word for word; "none" = just chat.`,
        `Any video can be 9:16 vertical (Shorts/Reels) or 16:9 widescreen (normal YouTube). Use the length and aspect the user asks for; if they don't say, use 0 for seconds and "auto" for aspect.`,
        `Niches: ${niches}. Styles: ${STYLES.join(", ")}.`,
      ].join("\n"),
      `${transcript ? `Conversation so far:\n${transcript}\n\n` : ""}User: ${message.slice(0, 6000)}
Return ONLY JSON: {"reply":"your chat reply to the user","action":"none|short|long|script","niche":"niche id","idea":"one-sentence video idea (for short/long)","seconds":0,"aspect":"auto|9:16|16:9","style":"style id","voice":"female|male|auto"}`,
      2000,
      60_000, // keep the chat snappy; the story writer gets its own budget
    );
    const action = ["short", "long", "script"].includes(String(json.action)) ? (json.action as Decision["action"]) : "none";
    return { reply: String(json.reply ?? "").slice(0, 3000), action, niche: String(json.niche ?? ""), idea: String(json.idea ?? ""), seconds: Number(json.seconds) || 0, style: String(json.style ?? ""), voice: String(json.voice ?? ""), aspect: asAspect(json.aspect) };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 16000) : "";
    if (message.length < 2) return Response.json({ error: "Type a message." }, { status: 400 });
    const history: Turn[] = Array.isArray(body.history) ? body.history.filter((turn: Turn) => turn && typeof turn.text === "string" && (turn.role === "user" || turn.role === "agent")).slice(-10) : [];
    const config = await getConfig();
    const origin = new URL(request.url).origin;
    // Length / frame pickers under the chat box win over anything guessed from the text.
    const pickedSeconds = Math.max(0, Math.min(900, Math.round(Number(body.length) || 0)));
    const pickedAspect = asAspect(body.aspect);
    const reviewFirst = body.reviewFirst === true || /\b(script first|review (it|the script)|let me (see|read|review|check)|before (you )?(make|render|produce))/i.test(message);

    const wantsVideo = /\b(make|create|generate|produce|render|build)\b[\s\S]{0,60}\b(video|short|reel|clip|story)\b/i.test(message);
    const decision = (await decide(message, history)) ?? {
      // No model reachable: fall back to the simple rules (video requests only).
      reply: wantsVideo ? "" : "I can't reach a chat model right now (all free AI providers are busy or no key is set). I can still make videos — tell me what to make, e.g. “Make a 30 second scary story”.",
      action: wantsVideo ? (message.split(/\s+/).length > 90 ? "script" : (pickedSeconds || parseDuration(message)) >= 90 || (!pickedSeconds && /\blong\b/i.test(message)) ? "long" : "short") : "none",
    } as Decision;

    if (decision.action === "none") return Response.json({ reply: decision.reply || "…", note: null, video: null });

    const nicheId = NICHES.some((n) => n.id === decision.niche) ? decision.niche! : NICHE_WORDS.find(([pattern]) => pattern.test(message))?.[1] ?? "motivation";
    const niche = getNiche(nicheId);
    const style = STYLES.includes(decision.style as VisualStyle) ? (decision.style as VisualStyle) : parseStyle(message, niche.defaultStyle);
    const voiceGender = decision.voice === "female" || /\bfemale|woman\b/i.test(message) ? "female" : decision.voice === "male" || /\bmale|man\b/i.test(message) ? "male" : "auto";
    const askedAspect = pickedAspect ?? parseAspect(message.slice(0, 400)) ?? decision.aspect;

    if (decision.action === "script") {
      const script = extractScript(message);
      const seconds = Math.round(script.split(/\s+/).length / 2.5);
      const settings = normalizeVideoSettings({ format: seconds > 170 || /\blong\b/i.test(message) ? "long" : "short", script, style, voiceGender, audience: niche.audience, aspect: askedAspect, pauseAfterStory: reviewFirst });
      const created = await createVideo({ niche: niche.id, settings, audience: niche.audience });
      await enqueueJob(created.id, "story", reviewFirst ? "Planning your script for review (AI Chat)." : "Queued from AI Chat (script mode).");
      continueInBackground(origin);
      const length = settings.format === "long" ? `${Math.round(settings.targetDuration / 60)}-minute` : `${settings.targetDuration}-second`;
      const reply = `${decision.reply ? `${decision.reply}\n\n` : ""}${reviewFirst ? "Planning" : "Making"} a ${length} ${shape(aspectOf(settings))} video from your script — your words stay exactly as written; I'm only designing an AI image and camera move for each line.${reviewFirst ? " It stops when the storyboard is ready so you can check it — open the editor, then press Render video." : ""}`;
      return Response.json({ reply, note: null, video: await getVideo(created.id) }, { status: 201 });
    }

    const asked = pickedSeconds || parseDuration(message) || decision.seconds || 0;
    if ((decision.action === "long" && !(asked > 0 && asked < 90)) || asked >= 90) {
      const settings = normalizeVideoSettings({ format: "long", targetDuration: Math.max(60, Math.min(900, asked >= 60 ? asked : config.daily.longMinutes * 60)), style, voiceGender, idea: decision.idea || message.slice(0, 400), audience: niche.audience, aspect: askedAspect, pauseAfterStory: reviewFirst });
      const created = await createVideo({ niche: niche.id, settings, audience: niche.audience });
      await enqueueJob(created.id, "story", reviewFirst ? "Writing the script for review (AI Chat)." : "Queued from AI Chat (long video).");
      continueInBackground(origin);
      const minutes = Math.round(settings.targetDuration / 60);
      const reply = `${decision.reply ? `${decision.reply}\n\n` : ""}${reviewFirst
        ? `Writing a ${minutes}-minute ${niche.label.toLowerCase()} script (${shape(aspectOf(settings))}), part by part. It stops when the script is ready so you can read and edit it — open the editor, then press Render video.`
        : `Started a ${minutes}-minute ${niche.label.toLowerCase()} video (${shape(aspectOf(settings))}). I'll outline it, write it part by part, make an AI image for every scene, animate them, add voice, captions and music, then edit it together. Progress is saved as it goes — open the editor to read the script as it's written.`}`;
      return Response.json({ reply, note: null, video: await getVideo(created.id) }, { status: 201 });
    }

    const targetDuration = Math.max(10, Math.min(60, asked || 30));
    const idea = decision.idea || message.slice(0, 400);
    const settings = normalizeVideoSettings({ targetDuration, style, voiceGender, idea, audience: niche.audience, aspect: askedAspect });
    const { plan, note } = await generateStoryPlan({
      niche: niche.id, idea, targetDuration: settings.targetDuration, style: settings.style,
      maxScenes: config.maxScenesPerVideo, timezone: config.timezone, voiceGender: settings.voiceGender, avoidTitles: await recentTitles(20), aspect: aspectOf(settings),
    });
    plan.format = "short";
    plan.aspect = aspectOf(settings);
    const created = await createVideo({ niche: niche.id, subNiche: plan.subNiche, settings, story: plan, audience: niche.audience });
    const reply = `${decision.reply ? `${decision.reply}\n\n` : ""}Here's the plan for a ${settings.targetDuration}-second ${shape(aspectOf(settings))} ${niche.label.toLowerCase()} video: “${plan.title}” — ${plan.scenes.length} scenes, ${settings.style.replace("-", " ")} style. Review it, then press Produce.`;
    return Response.json({ reply, note, video: await getVideo(created.id) }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
