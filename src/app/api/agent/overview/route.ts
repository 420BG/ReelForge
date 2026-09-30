import { nicheSummaries } from "@/content/niches/registry";
import { textModelConfigured } from "@/content/story-engine/llm";
import { fail, guard } from "@/jobs/api-helpers";
import { activeJobs, activityCounts, getConfig, listVideos, recentFailures, usageToday, workflowCounts } from "@/jobs/repo";
import { getAccount } from "@/lib/youtube";
import { ffmpegAvailable } from "@/video/composition/ffmpeg";
import { providerStatus } from "@/video/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let ffmpegCache: { at: number; ok: boolean } | null = null;

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const config = await getConfig();
    if (!ffmpegCache || Date.now() - ffmpegCache.at > 60_000) ffmpegCache = { at: Date.now(), ok: await ffmpegAvailable() };
    const account = await getAccount();
    const [counts, jobs, failures, usage, recent, activity] = await Promise.all([workflowCounts(), activeJobs(), recentFailures(), usageToday(), listVideos("all", 12), activityCounts(config.timezone)]);
    return Response.json({
      counts,
      activity,
      jobs,
      failures,
      usage,
      recent,
      config,
      niches: nicheSummaries(),
      status: {
        providers: providerStatus(config),
        textModel: textModelConfigured(),
        voice: { free: true, pollinations: Boolean(process.env.POLLINATIONS_API_KEY), elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY) },
        imageMode: { allowed: config.allowImageMode, available: true },
        ffmpeg: ffmpegCache.ok,
        youtubeConnected: Boolean(account?.refreshToken || account?.accessToken),
        youtubeChannelTitle: account?.channelTitle ?? null,
        worker: process.env.AGENT_WORKER === "off" ? "dashboard-only" : "background",
      },
    });
  } catch (error) {
    return fail(error, 500);
  }
}
