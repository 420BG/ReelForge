import type { AgentConfig } from "@/content/types";
import { cloudflareConfigured } from "@/content/story-engine/llm";
import { isExhausted, markCall, markFailure } from "@/lib/pipeline/usage";
import { pollinationsImage } from "@/video/providers/pollinations";
import { httpRetryable, ProviderError, type ClipResult } from "@/video/providers/types";

/**
 * Free AI still-image chain for keyframes and IMAGE MODE.
 * Pollinations (keyed, or key-less) → Cloudflare Workers AI FLUX schnell → Hugging Face FLUX schnell.
 * Each is optional; a provider that hits its daily quota is skipped until the next UTC day.
 */

type ImageProvider = { id: string; label: string; envHint: string; enabled: () => boolean; run: (prompt: string, seed: number, config: AgentConfig) => Promise<ClipResult> };

const hfToken = () => process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "";

function imageFromJsonBase64(text: string, provider: string): ClipResult {
  let data: { result?: { image?: string }; image?: string } | null = null;
  try { data = JSON.parse(text); } catch { /* handled below */ }
  const b64 = data?.result?.image ?? data?.image;
  if (!b64) throw new ProviderError(`${provider} returned no image.`, true);
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 2000) throw new ProviderError(`${provider} returned an empty image.`, true);
  return { bytes, mimeType: bytes[0] === 0x89 ? "image/png" : "image/jpeg" };
}

async function readImageResponse(response: Response, provider: string): Promise<ClipResult> {
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 160);
    throw new ProviderError(`${provider} returned ${response.status}. ${detail}`.trim(), httpRetryable(response.status), response.status);
  }
  const type = response.headers.get("content-type") || "";
  if (type.includes("json")) return imageFromJsonBase64(await response.text(), provider);
  if (!type.startsWith("image/")) throw new ProviderError(`${provider} did not return an image.`, true);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2000) throw new ProviderError(`${provider} returned an empty image.`, true);
  return { bytes, mimeType: type.split(";")[0] };
}

export const IMAGE_PROVIDERS: ImageProvider[] = [
  {
    id: "pollinations-image", label: "Pollinations FLUX", envHint: "none (POLLINATIONS_API_KEY optional)",
    enabled: () => true,
    run: (prompt, seed, config) => pollinationsImage(prompt, seed, config),
  },
  {
    id: "cloudflare-image", label: "Cloudflare Workers AI · FLUX.1 schnell", envHint: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN",
    enabled: () => cloudflareConfigured(),
    run: async (prompt, seed) => {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `${prompt.slice(0, 1800)}, vertical 9:16 composition, subject centered`, steps: 6, seed }),
        signal: AbortSignal.timeout(90_000), cache: "no-store",
      });
      return readImageResponse(response, "Cloudflare FLUX");
    },
  },
  {
    id: "huggingface-image", label: "Hugging Face · FLUX.1 schnell", envHint: "HF_TOKEN",
    enabled: () => Boolean(hfToken()),
    run: async (prompt, seed) => {
      const model = process.env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${hfToken()}`, "Content-Type": "application/json", Accept: "image/jpeg" },
        body: JSON.stringify({ inputs: prompt.slice(0, 1800), parameters: { width: 768, height: 1344, seed, num_inference_steps: 4 } }),
        signal: AbortSignal.timeout(120_000), cache: "no-store",
      });
      return readImageResponse(response, "Hugging Face");
    },
  },
];

export function imageProviderStatus() {
  return IMAGE_PROVIDERS.map((provider) => ({ id: provider.id, label: provider.label, env: provider.envHint, configured: provider.enabled() }));
}

/** Tries each configured image provider in order; throws the last error if all fail. */
export async function generateImage(prompt: string, seed: number, config: AgentConfig): Promise<ClipResult & { provider: string }> {
  const errors: string[] = [];
  let retryable = false;
  for (const provider of IMAGE_PROVIDERS) {
    if (!provider.enabled()) continue;
    if (await isExhausted(provider.id)) { errors.push(`${provider.label}: daily quota used`); continue; }
    try {
      const result = await provider.run(prompt, seed, config);
      await markCall(provider.id);
      return { ...result, provider: provider.id };
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : undefined;
      // Key-less Pollinations 429s are per-minute throttles, not a daily quota.
      await markFailure(provider.id, status === 402 || (status === 429 && provider.id !== "pollinations-image"));
      retryable = retryable || !(error instanceof ProviderError) || error.retryable;
      errors.push(`${provider.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new ProviderError(`No image provider answered (${errors.join("; ") || "none configured"}).`, retryable || errors.length === 0);
}
