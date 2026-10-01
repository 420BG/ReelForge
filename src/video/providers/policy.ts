import type { AgentConfig, ProviderId, ProviderTier } from "@/content/types";
import { PAID_PROVIDER_IDS } from "@/content/types";
import { ProviderError } from "@/video/providers/types";

/**
 * THE single rule for which AI video provider may be called. Every generation path goes
 * through providerAccess()/assertProviderAllowed() — the pipeline's provider chain, the
 * submit/poll wrappers, and each paid provider's own submit()/poll() (defence in depth).
 *
 * A PAID provider is callable only if BOTH:   config.freeMode === false   AND   providers[id].enabled === true.
 * A key being present is never enough. Paid providers are never used as an automatic fallback.
 */

export const PROVIDER_TIER: Record<ProviderId, ProviderTier> = {
  pollinations: "free-tier",
  fal: "paid",
  replicate: "paid",
  luma: "paid",
  runway: "paid",
};

export type AccessStatus = "ready" | "enabled" | "not-configured" | "disabled" | "blocked-free-mode";
export type Access = { allowed: boolean; status: AccessStatus; reason: string };

export function isPaid(id: string): boolean {
  return PAID_PROVIDER_IDS.includes(id as ProviderId);
}

export function providerAccess(id: string, configured: boolean, config: AgentConfig): Access {
  const known = id in PROVIDER_TIER;
  if (!known) return { allowed: false, status: "disabled", reason: "Unknown provider" };
  const switchOn = config.providers?.[id as ProviderId]?.enabled === true;
  if (isPaid(id)) {
    if (config.freeMode !== false) return { allowed: false, status: "blocked-free-mode", reason: "Paid provider blocked by Free Mode" };
    if (!switchOn) return { allowed: false, status: "disabled", reason: "Paid provider disabled" };
    if (!configured) return { allowed: false, status: "not-configured", reason: "API key not set" };
    return { allowed: true, status: "enabled", reason: "Paid provider enabled by you" };
  }
  if (!switchOn) return { allowed: false, status: "disabled", reason: "Provider disabled" };
  if (!configured) return { allowed: false, status: "not-configured", reason: "Not configured" };
  return { allowed: true, status: "ready", reason: "Free tier" };
}

/** Throws (non-retryable) when the call is not allowed. Use right before any network call. */
export function assertProviderAllowed(id: string, configured: boolean, config: AgentConfig) {
  const access = providerAccess(id, configured, config);
  if (!access.allowed) throw new ProviderError(`${access.reason} — no call was made to ${id}.`, false, 451);
}

export const FREE_UNAVAILABLE_MESSAGE = "Free AI generation is currently unavailable. No paid provider was used.";
