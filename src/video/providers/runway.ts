import type { AgentConfig } from "@/content/types";
import { assertProviderAllowed } from "@/video/providers/policy";
import { downloadMedia, httpRetryable, ProviderError, type ClipPoll, type ClipRequest, type ClipSubmission, type VideoProvider } from "@/video/providers/types";

/**
 * Runway API (optional, paid). Image-to-video only: animates the scene's AI keyframe.
 * Env: RUNWAYML_API_SECRET, optional RUNWAY_MODEL (default gen4_turbo).
 */
const BASE = "https://api.dev.runwayml.com/v1";
const headers = () => {
  const key = process.env.RUNWAYML_API_SECRET;
  if (!key) throw new ProviderError("Video provider not configured (RUNWAYML_API_SECRET).", false);
  return { Authorization: `Bearer ${key}`, "X-Runway-Version": process.env.RUNWAY_API_VERSION || "2024-11-06", "Content-Type": "application/json" };
};

export const runwayVideo: VideoProvider = {
  id: "runway",
  label: "Runway",
  paid: true,
  capabilities: { textToVideo: false, imageToVideo: true, clipDurations: [5, 10], seed: true, negativePrompt: false },
  isConfigured: () => Boolean(process.env.RUNWAYML_API_SECRET),
  async submit(request: ClipRequest, config: AgentConfig): Promise<ClipSubmission> {
    // PAID provider: refuses to run unless Free Mode is off AND this provider is enabled (second lock).
    assertProviderAllowed("runway", Boolean(process.env.RUNWAYML_API_SECRET), config);
    const image = request.imageUrl ?? request.imageDataUrl;
    if (!image) throw new ProviderError("Runway needs the scene image (image-to-video only).", false);
    const body = {
      model: process.env.RUNWAY_MODEL || "gen4_turbo",
      promptImage: image,
      promptText: request.prompt.slice(0, 950),
      ratio: request.aspectRatio === "16:9" ? "1280:720" : "720:1280",
      duration: request.durationSec > 7 ? 10 : 5,
      ...(request.seed != null ? { seed: request.seed % 4_294_967_295 } : {}),
    };
    const response = await fetch(`${BASE}/image_to_video`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(60_000), cache: "no-store" });
    const text = await response.text();
    if (!response.ok) throw new ProviderError(`Runway returned ${response.status}: ${text.slice(0, 200)}`, httpRetryable(response.status), response.status);
    const id = JSON.parse(text)?.id;
    if (typeof id !== "string") throw new ProviderError("Runway did not return a task id.", true);
    return { status: "pending", ref: id };
  },
  async poll(ref: string, config: AgentConfig): Promise<ClipPoll> {
    assertProviderAllowed("runway", Boolean(process.env.RUNWAYML_API_SECRET), config);
    if (!/^[\w-]{8,80}$/.test(ref)) return { status: "failed", error: "Invalid Runway task reference.", retryable: false };
    const response = await fetch(`${BASE}/tasks/${ref}`, { headers: headers(), signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!response.ok) return httpRetryable(response.status) ? { status: "pending" } : { status: "failed", error: `Runway status ${response.status}`, retryable: false };
    const data = await response.json() as { status?: string; output?: string[]; failure?: string };
    if (data.status === "SUCCEEDED" && data.output?.[0]) return { status: "done", result: await downloadMedia(data.output[0], "video") };
    if (data.status === "FAILED" || data.status === "CANCELLED") return { status: "failed", error: `Runway: ${data.failure ?? data.status}`, retryable: false };
    return { status: "pending" };
  },
};
