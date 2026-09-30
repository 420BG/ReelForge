import { nicheSummaries } from "@/content/niches/registry";
import { cloudflareConfigured, textModelConfigured, textModelStatus } from "@/content/story-engine/llm";
import { fail, guard } from "@/jobs/api-helpers";
import { activeJobs, activityCounts, getConfig, listVideos, recentFailures, usageToday, workflowCounts } from "@/jobs/repo";
import { getAccount } from "@/lib/youtube";
import { ffmpegAvailable } from "@/video/composition/ffmpeg";
import { providerStatus } from "@/video/providers";
import { imageProviderStatus } from "@/video/providers/images";
import { stockConfigured, stockProviderStatus } from "@/video/providers/stock";

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
        stockMode: { allowed: config.allowStockVideo, available: stockConfigured() },
        // Free-tier catalogue for Settings: names + on/off only, never key values.
        free: {
          text: textModelStatus(),
          images: imageProviderStatus(),
          stock: stockProviderStatus(),
          voice: [
            { id: "free", label: "ReelForge free voices (StreamElements / Google)", env: "none", configured: true },
            { id: "cloudflare-tts", label: "Cloudflare MeloTTS (backup)", env: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN", configured: cloudflareConfigured() },
            { id: "pollinations", label: "Pollinations Kokoro", env: "POLLINATIONS_API_KEY", configured: Boolean(process.env.POLLINATIONS_API_KEY) },
            { id: "elevenlabs", label: "ElevenLabs (free 10k chars/month)", env: "ELEVENLABS_API_KEY", configured: Boolean(process.env.ELEVENLABS_API_KEY) },
          ],
        },
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
