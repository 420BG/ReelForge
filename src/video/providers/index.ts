import type { AgentConfig, ProviderId, VideoSettings } from "@/content/types";
import { falVideo } from "@/video/providers/fal";
import { pollinationsVideo } from "@/video/providers/pollinations";
import { replicateVideo } from "@/video/providers/replicate";
import type { VideoProvider } from "@/video/providers/types";

/**
 * Provider registry. To add a provider: implement VideoProvider in its own file and
 * add it here. Nothing else in the pipeline is provider-specific.
 */
export const VIDEO_PROVIDERS: VideoProvider[] = [pollinationsVideo, falVideo, replicateVideo];

export function getProvider(id: string | null | undefined) {
  return VIDEO_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

/** Picks the provider for a video: explicit choice if configured, else first configured in registry order. */
export function resolveProvider(settings: Pick<VideoSettings, "provider">, config: AgentConfig): VideoProvider | null {
  const wanted = settings.provider === "auto" ? config.defaultProvider : settings.provider;
  if (wanted !== "auto") {
    const provider = getProvider(wanted);
    return provider?.isConfigured() ? provider : null;
  }
  return VIDEO_PROVIDERS.find((provider) => provider.isConfigured()) ?? null;
}

export function providerStatus(config: AgentConfig) {
  return VIDEO_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    paid: provider.paid,
    configured: provider.isConfigured(),
    capabilities: provider.capabilities,
    pricePerSecond: config.pricePerSecond[provider.id as ProviderId] ?? null,
  }));
}

export function estimateCost(providerId: string | null, seconds: number, config: AgentConfig) {
  if (!providerId) return null;
  const price = config.pricePerSecond[providerId as ProviderId];
  return typeof price === "number" ? Math.round(price * seconds * 100) / 100 : null;
}
