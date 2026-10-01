import type { AgentConfig, ProviderId, VideoSettings } from "@/content/types";
import { falVideo } from "@/video/providers/fal";
import { lumaVideo } from "@/video/providers/luma";
import { pollinationsVideo } from "@/video/providers/pollinations";
import { PROVIDER_TIER, providerAccess } from "@/video/providers/policy";
import { replicateVideo } from "@/video/providers/replicate";
import { runwayVideo } from "@/video/providers/runway";
import type { VideoProvider } from "@/video/providers/types";

/**
 * AI video provider registry. To add a provider: implement VideoProvider in its own file,
 * add it here and give it a tier in policy.ts. Which provider may run is decided ONLY by
 * policy.providerAccess() — free/free-tier first; paid only when Free Mode is off AND enabled.
 */
export const VIDEO_PROVIDERS: VideoProvider[] = [pollinationsVideo, falVideo, replicateVideo, lumaVideo, runwayVideo];

export function getProvider(id: string | null | undefined) {
  return VIDEO_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function accessFor(provider: VideoProvider, config: AgentConfig) {
  return providerAccess(provider.id, provider.isConfigured(), config);
}

/**
 * Ordered providers this video may call: free-tier first, then paid ones that YOU enabled with
 * Free Mode off. Never a paid provider as an automatic fallback while Free Mode is on.
 */
export function videoProviderChain(settings: Pick<VideoSettings, "provider">, config: AgentConfig): VideoProvider[] {
  const allowed = (provider: VideoProvider) => accessFor(provider, config).allowed;
  const wanted = settings.provider === "auto" ? config.defaultProvider : settings.provider;
  if (wanted !== "auto") {
    const provider = getProvider(wanted);
    return provider && allowed(provider) ? [provider] : [];
  }
  const ordered = [...VIDEO_PROVIDERS].sort((a, b) => Number(PROVIDER_TIER[a.id] === "paid") - Number(PROVIDER_TIER[b.id] === "paid"));
  return ordered.filter(allowed);
}

/** @deprecated kept for older callers — same rules as videoProviderChain. */
export function resolveProvider(settings: Pick<VideoSettings, "provider">, config: AgentConfig): VideoProvider | null {
  return videoProviderChain(settings, config)[0] ?? null;
}

/** Safe status for the browser: names, tiers and on/off only — never key values. */
export function providerStatus(config: AgentConfig) {
  return VIDEO_PROVIDERS.map((provider) => {
    const access = accessFor(provider, config);
    return {
      id: provider.id,
      label: provider.label,
      tier: PROVIDER_TIER[provider.id],
      paid: PROVIDER_TIER[provider.id] === "paid",
      configured: provider.isConfigured(),
      enabled: config.providers?.[provider.id]?.enabled === true,
      usable: access.allowed,
      status: access.status,
      reason: access.reason,
      capabilities: provider.capabilities,
      pricePerSecond: config.pricePerSecond[provider.id as ProviderId] ?? null,
    };
  });
}

export function estimateCost(providerId: string | null, seconds: number, config: AgentConfig) {
  if (!providerId) return null;
  const price = config.pricePerSecond[providerId as ProviderId];
  return typeof price === "number" ? Math.round(price * seconds * 100) / 100 : null;
}
