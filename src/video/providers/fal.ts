import type { AgentConfig } from "@/content/types";
import { downloadMedia, httpRetryable, ProviderError, type ClipPoll, type ClipRequest, type ClipSubmission, type VideoProvider } from "@/video/providers/types";

/**
 * fal.ai queue API (optional, paid). Hosts many video models (LTX, Wan, Kling, Veo, Hailuo…).
 * Model ids and extra input fields are configurable in Agent settings because each model
 * names its parameters slightly differently.
 */
function authHeaders() {
  const key = process.env.FAL_KEY;
  if (!key) throw new ProviderError("Video provider not configured (FAL_KEY).", false);
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

async function readJson(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

export const falVideo: VideoProvider = {
  id: "fal",
  label: "fal.ai",
  paid: true,
  capabilities: { textToVideo: true, imageToVideo: true, clipDurations: [5, 10], seed: true, negativePrompt: true },
  isConfigured: () => Boolean(process.env.FAL_KEY),
  async submit(request: ClipRequest, config: AgentConfig): Promise<ClipSubmission> {
    const model = request.imageDataUrl ? config.models.fal.imageToVideo : config.models.fal.textToVideo;
    if (!/^[\w.-]+\/[\w./-]+$/.test(model)) throw new ProviderError("Set a valid fal model id in Agent settings.", false);
    const input: Record<string, unknown> = {
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      aspect_ratio: "9:16",
      duration: String(request.durationSec > 7 ? 10 : 5),
      seed: request.seed,
      ...(request.imageDataUrl ? { image_url: request.imageDataUrl } : {}),
      ...config.models.fal.extraInput,
    };
    const response = await fetch(`https://queue.fal.run/${model}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(input), signal: AbortSignal.timeout(60_000), cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok) throw new ProviderError(`fal.ai returned ${response.status}: ${JSON.stringify(data.detail ?? data).slice(0, 200)}`, httpRetryable(response.status), response.status);
    if (typeof data.status_url !== "string" || typeof data.response_url !== "string") throw new ProviderError("fal.ai did not return a queue URL.", true);
    return { status: "pending", ref: JSON.stringify({ status: data.status_url, response: data.response_url }) };
  },
  async poll(ref: string): Promise<ClipPoll> {
    const { status, response: responseUrl } = JSON.parse(ref) as { status: string; response: string };
    if (!/^https:\/\/queue\.fal\.run\//.test(status) || !/^https:\/\/queue\.fal\.run\//.test(responseUrl)) return { status: "failed", error: "Invalid fal.ai job reference.", retryable: false };
    const statusResponse = await fetch(status, { headers: authHeaders(), signal: AbortSignal.timeout(30_000), cache: "no-store" });
    const state = await readJson(statusResponse);
    if (!statusResponse.ok) return httpRetryable(statusResponse.status) ? { status: "pending" } : { status: "failed", error: `fal.ai status ${statusResponse.status}`, retryable: true };
    if (state.status === "IN_QUEUE" || state.status === "IN_PROGRESS") return { status: "pending" };
    if (state.status !== "COMPLETED") return { status: "failed", error: `fal.ai job ${state.status ?? "unknown"}`, retryable: true };
    const resultResponse = await fetch(responseUrl, { headers: authHeaders(), signal: AbortSignal.timeout(30_000), cache: "no-store" });
    const result = await readJson(resultResponse);
    if (!resultResponse.ok) return { status: "failed", error: `fal.ai result ${resultResponse.status}: ${JSON.stringify(result.detail ?? result).slice(0, 160)}`, retryable: resultResponse.status >= 500 };
    const url = result?.video?.url ?? result?.videos?.[0]?.url;
    if (typeof url !== "string") return { status: "failed", error: "fal.ai result had no video URL.", retryable: true };
    return { status: "done", result: await downloadMedia(url, "video") };
  },
};
