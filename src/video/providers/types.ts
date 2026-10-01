import type { AgentConfig, ProviderId } from "@/content/types";

export type ClipRequest = {
  prompt: string;
  negativePrompt?: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9";
  /** Public https URL of the keyframe, for providers that only accept URLs (Luma). */
  imageUrl?: string;
  seed?: number;
  /** data: URL of a keyframe for image-to-video (character/scene consistency). */
  imageDataUrl?: string;
  quality: "draft" | "production";
};

export type ClipResult = { bytes: Buffer; mimeType: string };

export type ClipSubmission =
  | { status: "done"; result: ClipResult }
  | { status: "pending"; ref: string };

export type ClipPoll =
  | { status: "pending" }
  | { status: "done"; result: ClipResult }
  | { status: "failed"; error: string; retryable: boolean };

export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.retryable = retryable;
    this.status = status;
  }
}

export interface VideoProvider {
  id: ProviderId;
  label: string;
  /** Free tiers still apply limits; `paid` just means "expect to pay per clip". */
  paid: boolean;
  capabilities: { textToVideo: boolean; imageToVideo: boolean; clipDurations: number[]; seed: boolean; negativePrompt: boolean };
  isConfigured(): boolean;
  submit(request: ClipRequest, config: AgentConfig): Promise<ClipSubmission>;
  poll?(ref: string, config: AgentConfig): Promise<ClipPoll>;
}

export function httpRetryable(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

const MAX_CLIP_BYTES = 150_000_000;

/** Downloads a provider output URL server-side (never exposed to the browser). */
export async function downloadMedia(url: string, expect: "video" | "image"): Promise<ClipResult> {
  if (!/^https:\/\//.test(url)) throw new ProviderError("Provider returned a non-HTTPS media URL.", false);
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000), cache: "no-store" });
  if (!response.ok) throw new ProviderError(`Downloading the generated ${expect} failed (${response.status}).`, httpRetryable(response.status), response.status);
  const mimeType = (response.headers.get("content-type") || (expect === "video" ? "video/mp4" : "image/jpeg")).split(";")[0];
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_CLIP_BYTES) throw new ProviderError("Generated file is too large.", false);
  if (bytes.length < 1000) throw new ProviderError("Generated file is empty.", true);
  return { bytes, mimeType };
}
