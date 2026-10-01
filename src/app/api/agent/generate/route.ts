import { fail, guard } from "@/jobs/api-helpers";
import { getConfig, getVideo } from "@/jobs/repo";
import { createScheduledVideo } from "@/jobs/scheduler";
import { continueInBackground, kickEnabled } from "@/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click "Generate Video": picks the niche (or uses yours), queues the full pipeline
 * (story → AI images → motion → voice → captions → music/SFX → edit → final render)
 * and starts the background worker so it keeps going after you close the page.
 */
export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const format = body.format === "long" ? "long" : "short";
    const config = await getConfig();
    const idea = typeof body.idea === "string" && body.idea.trim() ? body.idea.trim().slice(0, 400) : undefined;
    const created = await createScheduledVideo(format, config, undefined, idea, typeof body.niche === "string" ? body.niche : undefined);
    const background = continueInBackground(new URL(request.url).origin);
    return Response.json({
      video: await getVideo(created.id),
      background,
      note: background || kickEnabled() ? null : "Add a CRON_SECRET environment variable in Vercel so generation continues when this page is closed. Until then, keep the app open while it renders.",
    }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
