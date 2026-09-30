import { getNiche } from "@/content/niches/registry";
import { normalizePlan } from "@/content/story-engine/normalize";
import type { PlanScene, StoryPlan } from "@/content/types";
import { fail, guard, UUID } from "@/jobs/api-helpers";
import {
  cancelJobs, deleteVideo, dropAssetsBeyond, getConfig, getVideo, getVideoRow, normalizeVideoSettings, resetAssets, updateVideo,
} from "@/jobs/repo";
import { removeVideoMedia } from "@/video/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Invalid id." }, { status: 400 });
  const video = await getVideo(id);
  return video ? Response.json({ video }) : Response.json({ error: "Not found." }, { status: 404 });
}

const visualKey = (scene: PlanScene) => JSON.stringify([scene.visual, scene.animation, scene.camera, scene.atmosphere, scene.characters]);

/** Edits story/SEO/settings, or moves REVIEW ⇄ APPROVED. Edited scenes are marked for regeneration; others are kept. */
export async function PATCH(request: Request, context: Context) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Invalid id." }, { status: 400 });
  try {
    const row = await getVideoRow(id);
    if (!row) return Response.json({ error: "Not found." }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const config = await getConfig();
    const settings = body.settings ? normalizeVideoSettings({ ...body.settings, audience: row.audience }, normalizeVideoSettings(row.settings)) : normalizeVideoSettings(row.settings);
    const changed: string[] = [];

    if (body.story && typeof body.story === "object") {
      const previous = row.story as StoryPlan | null;
      const niche = getNiche(String(row.niche));
      const next = normalizePlan(body.story, niche, String(body.story.subNiche ?? row.sub_niche ?? ""), settings.targetDuration, config.maxScenesPerVideo, config.timezone, previous?.source ?? "ai", previous?.model);
      if (previous?.scenes?.length) {
        const voiceReset: number[] = [];
        const clipReset: number[] = [];
        next.scenes.forEach((scene, i) => {
          const old = previous.scenes[i];
          if (!old || old.narration !== scene.narration) voiceReset.push(i);
          if (!old || visualKey(old) !== visualKey(scene)) clipReset.push(i);
        });
        if (JSON.stringify(previous.characters) !== JSON.stringify(next.characters)) next.scenes.forEach((scene) => { if (scene.characters.length && !clipReset.includes(scene.index)) clipReset.push(scene.index); });
        if (voiceReset.length) await resetAssets(id, voiceReset, ["voice"]);
        if (clipReset.length) await resetAssets(id, clipReset, ["clip", "keyframe"]);
        if (next.scenes.length < previous.scenes.length) await dropAssetsBeyond(id, next.scenes.length);
        if (voiceReset.length || clipReset.length) changed.push(`scenes to regenerate: voice ${voiceReset.map((i) => i + 1).join(",") || "none"}, visuals ${clipReset.map((i) => i + 1).join(",") || "none"}`);
      }
      await updateVideo(id, { story: next, title: next.title, hook: next.hook });
    }
    if (body.settings) await updateVideo(id, { settings, privacy: settings.privacy });
    if (typeof body.workflow === "string") {
      const current = String(row.workflow);
      const allowed: Record<string, string[]> = { approved: ["review"], review: ["approved", "failed"], draft: ["failed", "review"] };
      if (!allowed[body.workflow]?.includes(current)) return Response.json({ error: `Can't move from ${current} to ${body.workflow}.` }, { status: 400 });
      if (body.workflow === "approved" && !row.final_path) return Response.json({ error: "Render the video before approving it." }, { status: 400 });
      await updateVideo(id, { workflow: body.workflow });
    }
    return Response.json({ video: await getVideo(id), changed });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Invalid id." }, { status: 400 });
  try {
    await cancelJobs(id);
    await deleteVideo(id);
    await removeVideoMedia(id);
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error, 500);
  }
}
