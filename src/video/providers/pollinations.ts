import type { AgentConfig } from "@/content/types";
import { httpRetryable, ProviderError, type ClipRequest, type ClipResult, type ClipSubmission, type VideoProvider } from "@/video/providers/types";

/**
 * Pollinations — the provider this project already used in /api/ai-video.
 * Same endpoint, same POLLINATIONS_API_KEY. Returns the MP4 in the response (synchronous).
 */
export const pollinationsVideo: VideoProvider = {
  id: "pollinations",
  label: "Pollinations Video",
  paid: false,
  capabilities: { textToVideo: true, imageToVideo: false, clipDurations: [5, 10], seed: true, negativePrompt: false },
  isConfigured: () => Boolean(process.env.POLLINATIONS_API_KEY),
  async submit(request: ClipRequest, config: AgentConfig): Promise<ClipSubmission> {
    const key = process.env.POLLINATIONS_API_KEY;
    if (!key) throw new ProviderError("Video provider not configured (POLLINATIONS_API_KEY).", false);
    const duration = request.durationSec > 7 ? 10 : 5;
    const url = new URL(`https://gen.pollinations.ai/video/${encodeURIComponent(request.prompt.slice(0, 900))}`);
    url.searchParams.set("duration", String(duration));
    url.searchParams.set("aspectRatio", request.aspectRatio);
    if (request.seed != null) url.searchParams.set("seed", String(request.seed));
    if (config.models.pollinations.video) url.searchParams.set("model", config.models.pollinations.video);
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(process.env.VERCEL ? 230_000 : 240_000), cache: "no-store" });
    } catch (error) {
      throw new ProviderError(`Pollinations timed out or was unreachable (${error instanceof Error ? error.message : "network"}).`, true);
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      const hint = response.status === 402 ? " Your Pollen balance may be empty — video models on Pollinations usually need credits." : "";
      throw new ProviderError(`Pollinations video returned ${response.status}.${hint} ${detail}`.trim(), httpRetryable(response.status), response.status);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("video/")) {
      await response.body?.cancel();
      throw new ProviderError("Pollinations did not return a video file.", true);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 2000) throw new ProviderError("Pollinations returned an empty clip.", true);
    return { status: "done", result: { bytes, mimeType: contentType.split(";")[0] } };
  },
};

/** When the key has no credits, go straight to the key-less endpoint for an hour. */
let keyedImageBrokeUntil = 0;

/** Still image generation (the AI image for every scene). */
export async function pollinationsImage(prompt: string, seed: number, config: AgentConfig, size: { width: number; height: number } = { width: 768, height: 1365 }, forceKeyless = false): Promise<ClipResult> {
  // With a key: authenticated gateway. Without (or if the key has no credits): the free key-less endpoint.
  const key = forceKeyless || keyedImageBrokeUntil > Date.now() ? undefined : process.env.POLLINATIONS_API_KEY;
  const model = config.models.pollinations.image || "flux";
  const encoded = encodeURIComponent(prompt.slice(0, 900));
  const url = key
    ? `https://gen.pollinations.ai/image/${encoded}?model=${encodeURIComponent(model)}&width=${size.width}&height=${size.height}&seed=${seed}&nologo=true`
    : `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=${size.width}&height=${size.height}&seed=${seed}&nologo=true`;
  let response: Response;
  try {
    response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(120_000), cache: "no-store" });
  } catch (error) {
    if (key) return pollinationsImage(prompt, seed, config, size, true);
    throw new ProviderError(`Pollinations image timed out (${error instanceof Error ? error.message : "network"}).`, true);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (key && [401, 402, 403].includes(response.status)) { keyedImageBrokeUntil = Date.now() + 3_600_000; return pollinationsImage(prompt, seed, config, size, true); }
    throw new ProviderError(`Pollinations image returned ${response.status}.`, httpRetryable(response.status), response.status);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new ProviderError("Pollinations did not return an image.", true);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2000) throw new ProviderError("Pollinations returned an empty image.", true);
  return { bytes, mimeType: contentType.split(";")[0] };
}
