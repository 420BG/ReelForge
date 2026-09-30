import type { AgentConfig } from "@/content/types";
import { downloadMedia, httpRetryable, ProviderError, type ClipPoll, type ClipRequest, type ClipSubmission, type VideoProvider } from "@/video/providers/types";

/** Replicate predictions API (optional, paid). Model + extra input are configurable. */
function headers() {
  const key = process.env.REPLICATE_API_TOKEN;
  if (!key) throw new ProviderError("Video provider not configured (REPLICATE_API_TOKEN).", false);
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function outputUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return outputUrl(output[0]);
  if (output && typeof output === "object") {
    const value = output as Record<string, unknown>;
    return outputUrl(value.video ?? value.url ?? null);
  }
  return null;
}

function toPoll(data: Record<string, unknown>): ClipPoll | { status: "ready"; url: string } {
  if (data.status === "succeeded") {
    const url = outputUrl(data.output);
    return url ? { status: "ready", url } : { status: "failed", error: "Replicate returned no video URL.", retryable: true };
  }
  if (data.status === "failed" || data.status === "canceled") return { status: "failed", error: `Replicate: ${String(data.error ?? data.status).slice(0, 200)}`, retryable: data.status === "failed" };
  return { status: "pending" };
}

export const replicateVideo: VideoProvider = {
  id: "replicate",
  label: "Replicate",
  paid: true,
  capabilities: { textToVideo: true, imageToVideo: true, clipDurations: [5, 6, 10], seed: true, negativePrompt: false },
  isConfigured: () => Boolean(process.env.REPLICATE_API_TOKEN),
  async submit(request: ClipRequest, config: AgentConfig): Promise<ClipSubmission> {
    const model = request.imageDataUrl ? config.models.replicate.imageToVideo : config.models.replicate.textToVideo;
    if (!/^[\w.-]+\/[\w.-]+$/.test(model)) throw new ProviderError("Set a valid Replicate model (owner/name) in Agent settings.", false);
    const input: Record<string, unknown> = {
      prompt: request.prompt,
      aspect_ratio: "9:16",
      duration: request.durationSec > 7 ? 10 : 5,
      seed: request.seed,
      ...(request.imageDataUrl ? { first_frame_image: request.imageDataUrl, image: request.imageDataUrl } : {}),
      ...config.models.replicate.extraInput,
    };
    const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, { method: "POST", headers: headers(), body: JSON.stringify({ input }), signal: AbortSignal.timeout(60_000), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ProviderError(`Replicate returned ${response.status}: ${String(data.detail ?? "").slice(0, 200)}`, httpRetryable(response.status), response.status);
    const getUrl = data?.urls?.get;
    if (typeof getUrl !== "string" || !getUrl.startsWith("https://api.replicate.com/")) throw new ProviderError("Replicate did not return a prediction URL.", true);
    return { status: "pending", ref: getUrl };
  },
  async poll(ref: string): Promise<ClipPoll> {
    if (!ref.startsWith("https://api.replicate.com/")) return { status: "failed", error: "Invalid Replicate job reference.", retryable: false };
    const response = await fetch(ref, { headers: headers(), signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!response.ok) return httpRetryable(response.status) ? { status: "pending" } : { status: "failed", error: `Replicate status ${response.status}`, retryable: false };
    const state = toPoll(await response.json());
    if (state.status === "ready") return { status: "done", result: await downloadMedia(state.url, "video") };
    return state;
  },
};
