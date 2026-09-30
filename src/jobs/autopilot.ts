import { autoPickableNiches, getNiche, isKnownNiche } from "@/content/niches/registry";
import { generateIdeas } from "@/content/story-engine";
import { textModelConfigured } from "@/content/story-engine/llm";
import type { VideoSettings } from "@/content/types";
import { createBatch, createVideo, enqueueJob, getConfig, normalizeVideoSettings, recentTitles } from "@/jobs/repo";

export type AutopilotRequest = {
  niche: string; // niche id or "auto"
  count: number;
  minDuration: number;
  maxDuration: number;
  settings: Partial<VideoSettings>;
};

/**
 * Autopilot batch: ideas → pick the strongest → one queued production job per video.
 * Every video lands in REVIEW unless auto-publish is enabled BOTH globally and for this batch.
 */
export async function startAutopilotBatch(request: AutopilotRequest) {
  const config = await getConfig();
  const count = Math.max(1, Math.min(config.maxVideosPerBatch, Math.round(request.count)));
  const minD = Math.max(10, Math.min(60, Math.round(request.minDuration)));
  const maxD = Math.max(minD, Math.min(60, Math.round(request.maxDuration)));
  const hasModel = textModelConfigured();
  let pool = request.niche === "auto" ? autoPickableNiches() : isKnownNiche(request.niche) ? [getNiche(request.niche)] : [];
  if (!pool.length) throw new Error("Unknown niche.");
  if (!hasModel) {
    pool = pool.filter((niche) => niche.fiction !== "never");
    if (!pool.length) throw new Error("Factual niches need a story model key (OPENROUTER_API_KEY or POLLINATIONS_API_KEY) so facts aren't invented.");
  }
  const batchId = await createBatch({ ...request, count, createdAt: new Date().toISOString() });
  const avoid = await recentTitles(30);
  const perNiche = new Map<string, number>();
  for (let i = 0; i < count; i++) perNiche.set(pool[i % pool.length].id, (perNiche.get(pool[i % pool.length].id) ?? 0) + 1);

  const created: { id: string; niche: string; idea: string }[] = [];
  const notes: string[] = [];
  for (const [nicheId, n] of perNiche) {
    const niche = getNiche(nicheId);
    let ideas: Awaited<ReturnType<typeof generateIdeas>> = [];
    try { ideas = await generateIdeas(nicheId, n, avoid); } catch (error) { notes.push(`${niche.label}: ${error instanceof Error ? error.message : "idea generation failed"}`); continue; }
    if (!hasModel) notes.push(`${niche.label}: no story model — the template writer will be used (stories will be similar).`);
    for (let k = 0; k < n; k++) {
      const idea = ideas[k % Math.max(1, ideas.length)];
      const duration = minD === maxD ? minD : Math.round(minD + Math.random() * (maxD - minD));
      const settings = normalizeVideoSettings({
        ...request.settings,
        targetDuration: duration,
        style: request.settings.style ?? niche.defaultStyle,
        audience: niche.audience,
        idea: idea?.idea ? `${idea.idea}${idea.hook ? ` Hook: ${idea.hook}` : ""}` : undefined,
        autoPublish: Boolean(request.settings.autoPublish) && config.autoPublishEnabled,
      });
      const video = await createVideo({ niche: niche.id, subNiche: idea?.subNiche || null, settings, batchId, audience: niche.audience });
      await enqueueJob(video.id, "story", `Autopilot batch ${batchId.slice(0, 8)}: queued (${duration}s).`);
      created.push({ id: video.id, niche: niche.id, idea: idea?.idea ?? "" });
    }
  }
  if (!created.length) throw new Error(notes.join(" ") || "Nothing could be queued.");
  return { batchId, created, notes, autoPublish: Boolean(request.settings.autoPublish) && config.autoPublishEnabled };
}
