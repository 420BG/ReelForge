import type { NicheDefinition } from "@/content/niches/registry";

/**
 * Content strategist rules. Sent to the story model with every plan so the
 * first 1–3 seconds do the heavy lifting and the structure stays tight.
 */
export const STRATEGY_RULES = [
  "Scene 1 is the HOOK: 1–3 seconds of narration that opens a curiosity gap immediately (a strange detail, a time stamp, a contradiction). No greetings, no 'in this video', no channel names.",
  "Then a SHORT SETUP (who/where) in one scene, ESCALATION over one or more scenes where each scene raises the stakes, a PAYOFF that answers the hook, and a TWIST if the niche suits it.",
  "The ENDING lands in one line. Optionally write a loopLine: a final phrase that flows naturally back into the first line of the hook so the Short replays seamlessly.",
  "Every scene must show something visually different (new angle, location, action or reveal). Avoid static talking scenes.",
  "Write ORIGINAL concepts and ORIGINAL wording. Never copy or paraphrase existing creators' scripts, famous creepypastas, films or books.",
  "Titles must be curiosity-driven but honest: they must describe what actually happens. No false factual claims, no fake 'true story' labels.",
];

export function hookGuidance(niche: NicheDefinition) {
  return `Hook skeletons for inspiration only (adapt, never reuse verbatim): ${niche.hookPatterns.map((pattern) => `"${pattern}"`).join(" | ")}.`;
}

/** Quick heuristic score used when choosing between several generated ideas. */
export function scoreHook(hook: string) {
  const text = hook.trim();
  let score = 50;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 5 && words <= 16) score += 15;
  if (words > 22) score -= 20;
  if (/\d/.test(text)) score += 6;
  if (/\b(never|last|only|exactly|nobody|didn't|wasn't|every night|but)\b/i.test(text)) score += 10;
  if (/[?…]$|\.\.\.$/.test(text)) score += 4;
  if (/\b(subscribe|like and|in this video|hey guys|welcome back)\b/i.test(text)) score -= 40;
  return Math.max(0, Math.min(100, score));
}
