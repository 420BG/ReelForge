import type { AgentConfig } from "@/content/types";
import { assertProviderAllowed } from "@/video/providers/policy";
import { downloadMedia, httpRetryable, ProviderError, type ClipPoll, type ClipRequest, type ClipSubmission, type VideoProvider } from "@/video/providers/types";

/**
 * Luma Dream Machine API (optional, paid). Image-to-video from the scene's AI keyframe
 * (needs a public URL, i.e. Supabase storage) or text-to-video otherwise.
 * Env: LUMAAI_API_KEY, optional LUMA_MODEL (default ray-flash-2).
 */
const BASE = "https://api.lumalabs.ai/dream-machine/v1/generations";
const headers = () => {
  const key = process.env.LUMAAI_API_KEY;
  if (!key) throw new ProviderError("Video provider not configured (LUMAAI_API_KEY).", false);
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
};

export const lumaVideo: VideoProvider = {
  id: "luma",
  label: "Luma Dream Machine",
  paid: true,
  capabilities: { textToVideo: true, imageToVideo: true, clipDurations: [5, 9], seed: false, negativePrompt: false },
  isConfigured: () => Boolean(process.env.LUMAAI_API_KEY),
  async submit(request: ClipRequest, config: AgentConfig): Promise<ClipSubmission> {
    // PAID provider: refuses to run unless Free Mode is off AND this provider is enabled (second lock).
    assertProviderAllowed("luma", Boolean(process.env.LUMAAI_API_KEY), config);
    const body: Record<string, unknown> = {
      prompt: request.prompt.slice(0, 1500),
      model: process.env.LUMA_MODEL || "ray-flash-2",
      aspect_ratio: request.aspectRatio,
      duration: request.durationSec > 7 ? "9s" : "5s",
      resolution: request.quality === "draft" ? "540p" : "720p",
      ...(request.imageUrl ? { keyframes: { frame0: { type: "image", url: request.imageUrl } } } : {}),
    };
    const response = await fetch(BASE, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(60_000), cache: "no-store" });
    const text = await response.text();
    if (!response.ok) throw new ProviderError(`Luma returned ${response.status}: ${text.slice(0, 200)}`, httpRetryable(response.status), response.status);
    const id = JSON.parse(text)?.id;
    if (typeof id !== "string") throw new ProviderError("Luma did not return a generation id.", true);
    return { status: "pending", ref: id };
  },
  async poll(ref: string, config: AgentConfig): Promise<ClipPoll> {
    assertProviderAllowed("luma", Boolean(process.env.LUMAAI_API_KEY), config);
    if (!/^[\w-]{8,80}$/.test(ref)) return { status: "failed", error: "Invalid Luma job reference.", retryable: false };
    const response = await fetch(`${BASE}/${ref}`, { headers: headers(), signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!response.ok) return httpRetryable(response.status) ? { status: "pending" } : { status: "failed", error: `Luma status ${response.status}`, retryable: false };
    const data = await response.json() as { state?: string; failure_reason?: string; assets?: { video?: string } };
    if (data.state === "completed" && data.assets?.video) return { status: "done", result: await downloadMedia(data.assets.video, "video") };
    if (data.state === "failed") return { status: "failed", error: `Luma: ${data.failure_reason ?? "generation failed"}`, retryable: false };
    return { status: "pending" };
  },
};
