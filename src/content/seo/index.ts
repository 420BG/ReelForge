import type { NicheDefinition } from "@/content/niches/registry";
import type { Audience, SeoPack, StoryPlan } from "@/content/types";

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

const CLICKBAIT = /\b(100% real|true story|real footage|not clickbait|you won'?t believe|gone wrong|proof)\b/gi;

/** Removes claims we cannot back up. Fiction may never be labelled real. */
export function honestTitle(title: string, isFiction: boolean) {
  let value = clean(title, 95).replace(/#shorts/gi, "").trim();
  if (isFiction) value = value.replace(CLICKBAIT, "").replace(/\s{2,}/g, " ").replace(/^[\s|:–-]+|[\s|:–-]+$/g, "").trim();
  return value || "Untitled Short";
}

function hashtag(value: string) {
  const tag = value.replace(/^#/, "").replace(/[^\p{L}\p{N}]/gu, "");
  return tag ? `#${tag}` : "";
}

export function suggestPublishTime(niche: NicheDefinition, seed: number, timezone: string) {
  const hour = niche.publishHours[Math.abs(seed) % niche.publishHours.length] ?? 19;
  const days = niche.pacing === "fast" ? "any weekday" : "Thu–Sun";
  return `${String(hour).padStart(2, "0")}:00 (${timezone}), ${days}`;
}

export function normalizeSeo(raw: unknown, niche: NicheDefinition, plan: Pick<StoryPlan, "title" | "concept" | "isFiction" | "hook"> & { format?: StoryPlan["format"] }, timezone: string): SeoPack {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const title = honestTitle(clean(value.title, 95) || plan.title, plan.isFiction);
  const hashtags = Array.from(new Set([
    ...(Array.isArray(value.hashtags) ? value.hashtags : []).map((item) => hashtag(String(item))),
    ...niche.seo.hashtags,
    plan.format === "long" ? "" : "#shorts",
  ].filter(Boolean))).filter((tag) => plan.format !== "long" || tag.toLowerCase() !== "#shorts").slice(0, 8);
  const tags = Array.from(new Set([
    ...(Array.isArray(value.tags) ? value.tags : []).map((item) => clean(item, 40).toLowerCase()),
    ...niche.seo.baseTags,
  ].filter(Boolean))).slice(0, 15);
  let description = clean(value.description, 1200) || `${plan.hook} ${plan.concept}`.trim();
  if (plan.isFiction && !/fiction/i.test(description)) description += "\n\nThis is an original fictional story.";
  const seed = title.length + tags.length * 7;
  return {
    title,
    description,
    hashtags,
    tags,
    categoryId: /^\d{1,2}$/.test(String(value.categoryId)) ? String(value.categoryId) : niche.seo.categoryId,
    suggestedPublishTime: clean(value.suggestedPublishTime, 60) || suggestPublishTime(niche, seed, timezone),
  };
}

export type AgentUploadMetadata = {
  snippet: { title: string; description: string; tags: string[]; categoryId: string };
  status: { privacyStatus: "private" | "unlisted" | "public"; selfDeclaredMadeForKids: boolean };
};

/** Builds YouTube metadata for an agent video. Made-for-kids follows the per-video audience. */
export function agentUploadMetadata(seo: SeoPack, audience: Audience, privacy: "private" | "unlisted" | "public", aiDisclosure: string, format: "short" | "long" = "short"): AgentUploadMetadata {
  const base = seo.title.replace(/#shorts/gi, "").trim().slice(0, 88);
  const title = format === "long" ? base.slice(0, 100) : `${base} #Shorts`.slice(0, 100);
  const description = [seo.description, aiDisclosure, seo.hashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, 4900);
  return {
    snippet: { title, description, tags: seo.tags.slice(0, 15), categoryId: seo.categoryId || "24" },
    status: { privacyStatus: privacy, selfDeclaredMadeForKids: audience === "kids" },
  };
}
