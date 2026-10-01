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

type ImageProvider = { id: string; label: string; envHint: string; enabled: () => boolean; run: (prompt: string, seed: number, config: AgentConfig, aspect: "9:16" | "16:9") => Promise<ClipResult> };

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

export type Aspect = "9:16" | "16:9";
const dims = (aspect: Aspect) => (aspect === "16:9" ? { width: 1344, height: 768 } : { width: 768, height: 1344 });
const orientation = (aspect: Aspect) => (aspect === "16:9" ? "wide 16:9 landscape composition" : "vertical 9:16 composition, subject centered");

/** Every AI image provider was out of quota / refusing: the caller should wait and resume, not fail. */
export class ImageQuotaError extends ProviderError {
  constructor(message: string) { super(message, true, 429); }
}

export const IMAGE_PROVIDERS: ImageProvider[] = [
  {
    id: "pollinations-image", label: "Pollinations FLUX", envHint: "none (POLLINATIONS_API_KEY optional)",
    enabled: () => true,
    run: (prompt, seed, config, aspect) => pollinationsImage(prompt, seed, config, dims(aspect)),
  },
  {
    id: "gemini-image", label: "Google Gemini image", envHint: "GEMINI_API_KEY (+ GEMINI_IMAGE_MODEL)",
    enabled: () => Boolean(process.env.GEMINI_API_KEY) && process.env.GEMINI_IMAGE !== "off",
    run: async (prompt, _seed, _config, aspect) => {
      const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
        body: JSON.stringify({ contents: [{ parts: [{ text: `Generate one image, no text in the image. ${prompt.slice(0, 1800)}, ${orientation(aspect)}` }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } } }),
        signal: AbortSignal.timeout(120_000), cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) throw new ProviderError(`Gemini image returned ${response.status}. ${text.slice(0, 160)}`, httpRetryable(response.status), response.status);
      let part: { inlineData?: { data?: string; mimeType?: string } } | undefined;
      try { part = (JSON.parse(text)?.candidates?.[0]?.content?.parts ?? []).find((item: { inlineData?: unknown }) => item.inlineData); } catch { /* handled below */ }
      if (!part?.inlineData?.data) throw new ProviderError("Gemini returned no image.", true);
      return { bytes: Buffer.from(part.inlineData.data, "base64"), mimeType: part.inlineData.mimeType || "image/png" };
    },
  },
  {
    id: "cloudflare-image", label: "Cloudflare Workers AI · FLUX.1 schnell", envHint: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN",
    enabled: () => cloudflareConfigured(),
    run: async (prompt, seed, _config, aspect) => {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `${prompt.slice(0, 1800)}, ${orientation(aspect)}`, steps: 6, seed }),
        signal: AbortSignal.timeout(90_000), cache: "no-store",
      });
      return readImageResponse(response, "Cloudflare FLUX");
    },
  },
  {
    id: "huggingface-image", label: "Hugging Face · FLUX.1 schnell", envHint: "HF_TOKEN",
    enabled: () => Boolean(hfToken()),
    run: async (prompt, seed, _config, aspect) => {
      const model = process.env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${hfToken()}`, "Content-Type": "application/json", Accept: "image/jpeg" },
        body: JSON.stringify({ inputs: prompt.slice(0, 1800), parameters: { ...dims(aspect), seed, num_inference_steps: 4 } }),
        signal: AbortSignal.timeout(120_000), cache: "no-store",
      });
      return readImageResponse(response, "Hugging Face");
    },
  },
  {
    // Community-run, genuinely free (anonymous key works, a free account key gets priority). Slow: last resort.
    id: "ai-horde", label: "AI Horde (community GPUs)", envHint: "none (AI_HORDE_API_KEY optional)",
    enabled: () => process.env.AI_HORDE !== "off",
    run: async (prompt, seed, _config, aspect) => {
      const headers = { apikey: process.env.AI_HORDE_API_KEY || "0000000000", "Client-Agent": "ReelForge:1.0:reelforge", "Content-Type": "application/json" };
      const size = aspect === "16:9" ? { width: 1024, height: 576 } : { width: 576, height: 1024 };
      const submit = await fetch("https://aihorde.net/api/v2/generate/async", {
        method: "POST", headers,
        body: JSON.stringify({ prompt: `${prompt.slice(0, 900)} ### text, watermark, blurry, deformed`, params: { ...size, steps: 20, n: 1, sampler_name: "k_euler_a", cfg_scale: 6, seed: String(seed) }, nsfw: false, censor_nsfw: true, r2: true, shared: false }),
        signal: AbortSignal.timeout(30_000), cache: "no-store",
      });
      const text = await submit.text();
      if (!submit.ok) throw new ProviderError(`AI Horde returned ${submit.status}. ${text.slice(0, 120)}`, httpRetryable(submit.status), submit.status);
      const id = JSON.parse(text)?.id;
      if (typeof id !== "string") throw new ProviderError("AI Horde did not queue the image.", true);
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        const check = await fetch(`https://aihorde.net/api/v2/generate/check/${id}`, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" }).then((r) => r.json()).catch(() => null) as { done?: boolean; faulted?: boolean } | null;
        if (check?.faulted) throw new ProviderError("AI Horde job failed.", true);
        if (!check?.done) continue;
        const status = await fetch(`https://aihorde.net/api/v2/generate/status/${id}`, { headers, signal: AbortSignal.timeout(20_000), cache: "no-store" }).then((r) => r.json()) as { generations?: { img?: string }[] };
        const img = status.generations?.[0]?.img;
        if (!img) throw new ProviderError("AI Horde returned no image.", true);
        if (/^https:\/\//.test(img)) {
          const response = await fetch(img, { signal: AbortSignal.timeout(60_000), cache: "no-store" });
          return readImageResponse(response, "AI Horde");
        }
        const bytes = Buffer.from(img, "base64");
        return { bytes, mimeType: bytes[0] === 0x89 ? "image/png" : "image/webp" };
      }
      // Leave the request queued on the Horde; we just stop waiting for it.
      throw new ProviderError("AI Horde queue is busy right now.", true, 429);
    },
  },
];

export function imageProviderStatus() {
  return IMAGE_PROVIDERS.map((provider) => ({ id: provider.id, label: provider.label, env: provider.envHint, configured: provider.enabled() }));
}

/**
 * Tries each configured image provider in order and returns the first image.
 * Quota/credit refusals mark that provider "used up" for today (skipped until the next UTC day).
 * If every provider is out of quota, throws ImageQuotaError so the job waits and resumes later.
 */
export async function generateImage(prompt: string, seed: number, config: AgentConfig, aspect: Aspect = "9:16"): Promise<ClipResult & { provider: string }> {
  const errors: string[] = [];
  let retryable = false;
  let quotaOnly = true;
  for (const provider of IMAGE_PROVIDERS) {
    if (!provider.enabled()) continue;
    if (await isExhausted(provider.id)) { errors.push(`${provider.label}: daily quota used`); continue; }
    try {
      const result = await provider.run(prompt, seed, config, aspect);
      await markCall(provider.id);
      return { ...result, provider: provider.id };
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : undefined;
      const quota = status === 402 || status === 429 || status === 403;
      // Key-less Pollinations 429s are per-minute throttles, not a daily quota.
      await markFailure(provider.id, status === 402 || (quota && !["pollinations-image", "ai-horde"].includes(provider.id)));
      if (!quota) quotaOnly = false;
      retryable = retryable || !(error instanceof ProviderError) || error.retryable;
      errors.push(`${provider.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const message = `No image provider answered (${errors.join("; ") || "none configured"}).`;
  if (errors.length && quotaOnly) throw new ImageQuotaError(message);
  throw new ProviderError(message, retryable || errors.length === 0);
}
