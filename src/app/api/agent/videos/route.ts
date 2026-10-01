import { getNiche, isKnownNiche } from "@/content/niches/registry";
import { aspectOf } from "@/content/types";
import { continueInBackground } from "@/jobs/worker";
import { generateStoryPlan } from "@/content/story-engine";
import { fail, guard } from "@/jobs/api-helpers";
import { createVideo, enqueueJob, getConfig, getVideo, listVideos, normalizeVideoSettings, recentTitles } from "@/jobs/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const workflow = new URL(request.url).searchParams.get("workflow") ?? "all";
    return Response.json({ videos: await listVideos(workflow, 100) });
  } catch (error) {
    return fail(error, 500);
  }
}

/**
 * Creates a video. mode "plan" writes the story now so you can review/edit it before spending
 * on generation; mode "produce" queues the whole pipeline immediately.
 */
export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    if (!isKnownNiche(body.niche)) return Response.json({ error: "Choose a niche." }, { status: 400 });
    const niche = getNiche(body.niche);
    const config = await getConfig();
    const settings = normalizeVideoSettings({ ...(body.settings ?? {}), audience: niche.audience, allowImageMode: Boolean(body.settings?.allowImageMode) && config.allowImageMode });
    const subNiche = typeof body.subNiche === "string" && niche.subNiches.some((item) => item.id === body.subNiche) ? body.subNiche : null;
    // Long videos are outlined and written part by part inside the pipeline (resumable), so they always queue.
    if (body.mode === "plan" && settings.format !== "long" && !settings.script) {
      const { plan, note } = await generateStoryPlan({
        niche: niche.id, subNiche: subNiche ?? undefined, idea: settings.idea, targetDuration: settings.targetDuration, style: settings.style,
        maxScenes: config.maxScenesPerVideo, timezone: config.timezone, voiceGender: settings.voiceGender, avoidTitles: await recentTitles(20), aspect: aspectOf(settings),
      });
      plan.format = "short";
      plan.aspect = aspectOf(settings);
      const video = await createVideo({ niche: niche.id, subNiche: plan.subNiche, settings, story: plan, audience: niche.audience });
      return Response.json({ video: await getVideo(video.id), note }, { status: 201 });
    }
    // "Write script first" for Long / script videos: write it in the background, then stop for review.
    if (body.mode === "plan") settings.pauseAfterStory = true;
    const video = await createVideo({ niche: niche.id, subNiche, settings, audience: niche.audience });
    await enqueueJob(video.id, "story", body.mode === "plan" ? "Writing the script for review." : "Queued from Create.");
    continueInBackground(new URL(request.url).origin);
    return Response.json({ video: await getVideo(video.id), note: null }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
