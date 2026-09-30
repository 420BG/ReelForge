import { fail, guard, UUID } from "@/jobs/api-helpers";
import {
  activeJobFor, cancelJobs, enqueueJob, getVideo, getVideoRow, resetAssets, resetFailedAssets, updateVideo,
} from "@/jobs/repo";
import { publishAgentVideo } from "@/jobs/youtube-upload";
import type { AgentJob, StoryPlan } from "@/content/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

/**
 * produce            – queue the full pipeline (skips anything already generated)
 * retry              – reset only FAILED scene assets and resume from the failed step
 * regenerate-scene   – regenerate one scene's clip (and optionally its voice), then recompose
 * rewrite-story      – throw away the story and write a new one (clips/voices reset)
 * recompose          – rebuild the final MP4 from existing clips (e.g. after caption changes)
 * cancel             – stop the active job
 * publish            – upload an APPROVED video with the existing YouTube integration
 */
export async function POST(request: Request, context: Context) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Invalid id." }, { status: 400 });
  try {
    const row = await getVideoRow(id);
    if (!row) return Response.json({ error: "Not found." }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const story = row.story as StoryPlan | null;
    const start = async (step: AgentJob["step"], note: string) => {
      if (await activeJobFor(id)) throw new Error("A job for this video is already running.");
      await updateVideo(id, { workflow: "processing", error: null });
      await enqueueJob(id, step, note);
    };

    switch (action) {
      case "produce":
        await start(story?.scenes?.length ? "voice" : "story", "Production queued.");
        break;
      case "retry": {
        const last = (await getVideo(id))?.job;
        await resetFailedAssets(id);
        const step: AgentJob["step"] = last?.state === "failed" && last.step !== "done" ? last.step : story?.scenes?.length ? "voice" : "story";
        await start(step, `Retry from "${step}" (finished scenes are kept).`);
        break;
      }
      case "regenerate-scene": {
        const index = Number(body.scene);
        if (!story || !Number.isInteger(index) || index < 0 || index >= story.scenes.length) return Response.json({ error: "Invalid scene." }, { status: 400 });
        await resetAssets(id, [index], body.voice ? ["clip", "keyframe", "voice"] : ["clip", "keyframe"]);
        await start(body.voice ? "voice" : "clips", `Regenerating scene ${index + 1}${body.voice ? " (visual + voice)" : ""}.`);
        break;
      }
      case "rewrite-story":
        if (await activeJobFor(id)) throw new Error("A job for this video is already running.");
        if (story) await resetAssets(id, story.scenes.map((scene) => scene.index), ["clip", "keyframe", "voice"]);
        await updateVideo(id, { story: null, title: "", hook: null, final_path: null, cover_path: null, render_mode: null });
        await start("story", "Rewriting story from scratch.");
        break;
      case "recompose":
        if (!story) return Response.json({ error: "No story yet." }, { status: 400 });
        await start("segments", "Recomposing from existing clips (unchanged scenes are reused).");
        break;
      case "cancel":
        await cancelJobs(id);
        await updateVideo(id, { workflow: row.final_path ? "review" : "draft", error: "Cancelled." });
        break;
      case "publish": {
        const result = await publishAgentVideo(id, { requireApproved: true });
        return Response.json({ video: await getVideo(id), url: result.url });
      }
      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    return Response.json({ video: await getVideo(id) });
  } catch (error) {
    return fail(error);
  }
}
