import { nicheSummaries } from "@/content/niches/registry";
import { cloudflareConfigured, textModelConfigured, textModelStatus } from "@/content/story-engine/llm";
import { fail, guard } from "@/jobs/api-helpers";
import { activeJobs, activityCounts, getConfig, listVideos, providerHealth, recentFailures, usageToday, videosToday, workflowCounts } from "@/jobs/repo";
import { dailyState, runDailySchedule } from "@/jobs/scheduler";
import { continueInBackground, kickEnabled } from "@/jobs/worker";
import { getAccount } from "@/lib/youtube";
import { ffmpegAvailable } from "@/video/composition/ffmpeg";
import { providerStatus } from "@/video/providers";
import { imageProviderStatus } from "@/video/providers/images";
import { stockConfigured, stockProviderStatus } from "@/video/providers/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let ffmpegCache: { at: number; ok: boolean } | null = null;

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const config = await getConfig();
    if (!ffmpegCache || Date.now() - ffmpegCache.at > 60_000) ffmpegCache = { at: Date.now(), ok: await ffmpegAvailable() };
    const account = await getAccount();
    // Opening the dashboard also triggers today's scheduled videos if they're due.
    if (config.daily.short || config.daily.long) {
      const created = await runDailySchedule().catch(() => []);
      if (created.length) continueInBackground(new URL(request.url).origin);
    }
    const [counts, jobs, failures, usage, recent, activity, health, daily, today] = await Promise.all([workflowCounts(), activeJobs(), recentFailures(), usageToday(), listVideos("all", 12), activityCounts(config.timezone), providerHealth(), dailyState().catch(() => ({ short: null, long: null })), videosToday(config.timezone).catch(() => ({ short: { started: 0, finished: 0 }, long: { started: 0, finished: 0 } }))]);
    // Free daily usage: real counts only. Providers rarely expose remaining quota, so none is invented.
    const freeCalls = Object.entries(health).filter(([id]) => !/^video-(fal|replicate|luma|runway)$/.test(id)).reduce((sum, [, row]) => sum + row.calls, 0);
    const outOfQuota = Object.entries(health).filter(([, row]) => row.exhausted).map(([id]) => id);
    const freeUsage = {
      target: { short: 1, long: 1 },
      videos: today,
      remaining: { short: Math.max(0, 1 - today.short.started), long: Math.max(0, 1 - today.long.started) },
      aiCallsToday: freeCalls,
      paidCallsToday: Object.entries(health).filter(([id]) => /^video-(fal|replicate|luma|runway)$/.test(id)).reduce((sum, [, row]) => sum + row.calls, 0),
      outOfQuota,
      note: "Free-tier availability depends on provider limits.",
    };
    const withHealth = <T extends { id: string }>(list: T[], prefix = "") => list.map((item) => ({ ...item, health: health[`${prefix}${item.id}`] ?? null }));
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
        providers: withHealth(providerStatus(config), "video-"),
        textModel: textModelConfigured(),
        voice: { free: true, pollinations: Boolean(process.env.POLLINATIONS_API_KEY), elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY) },
        imageMode: { allowed: config.allowImageMode, available: true },
        stockMode: { allowed: config.allowStockVideo, available: stockConfigured() },
        // Free-tier catalogue for Settings: names + on/off only, never key values.
        free: {
          text: withHealth(textModelStatus()),
          images: withHealth(imageProviderStatus()),
          stock: stockProviderStatus(),
          voice: [
            { id: "free", label: "ReelForge free voices (StreamElements / Google)", env: "none", configured: true },
            { id: "deepgram", label: "Deepgram Aura-2 (free credits)", env: "DEEPGRAM_API_KEY", configured: Boolean(process.env.DEEPGRAM_API_KEY) },
            { id: "cloudflare-tts", label: "Cloudflare MeloTTS (backup)", env: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN", configured: cloudflareConfigured() },
            { id: "pollinations", label: "Pollinations Kokoro", env: "POLLINATIONS_API_KEY", configured: Boolean(process.env.POLLINATIONS_API_KEY) },
            { id: "elevenlabs", label: "ElevenLabs (free 10k chars/month)", env: "ELEVENLABS_API_KEY", configured: Boolean(process.env.ELEVENLABS_API_KEY) },
          ],
        },
        ffmpeg: ffmpegCache.ok,
        daily: { ...daily, background: kickEnabled() },
        freeMode: config.freeMode,
        freeUsage,
        youtubeConnected: Boolean(account?.refreshToken || account?.accessToken),
        youtubeChannelTitle: account?.channelTitle ?? null,
        worker: process.env.AGENT_WORKER === "off" ? "dashboard-only" : "background",
      },
    });
  } catch (error) {
    return fail(error, 500);
  }
}
