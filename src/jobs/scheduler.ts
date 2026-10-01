import { autoPickableNiches, getNiche, isKnownNiche } from "@/content/niches/registry";
import { textModelConfigured } from "@/content/story-engine/llm";
import type { AgentConfig, VideoFormat } from "@/content/types";
import { createVideo, enqueueJob, getConfig, normalizeVideoSettings, q } from "@/jobs/repo";

/**
 * Daily production: one Short and/or one Long per day at local times.
 * Called from every cron ping / worker tick; an atomic per-day claim guarantees each
 * kind is created at most once per day even when several ticks run at the same time.
 * Scheduler bookkeeping lives in agent_settings row id=2 (row 1 is your settings).
 */

function localNow(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

async function claimSlot(kind: VideoFormat, date: string) {
  await q("INSERT INTO agent_settings (id, config) VALUES (2, '{}'::jsonb) ON CONFLICT (id) DO NOTHING");
  const rows = await q(
    `UPDATE agent_settings SET config = jsonb_set(config, ARRAY[$1::text], to_jsonb($2::text), true), updated_at = now()
     WHERE id = 2 AND COALESCE(config->>$1, '') <> $2 RETURNING id`,
    [`daily-${kind}`, date],
  );
  return rows.length > 0;
}

export async function dailyState() {
  const [row] = await q<{ config: Record<string, string> }>("SELECT config FROM agent_settings WHERE id = 2");
  return { short: row?.config?.["daily-short"] ?? null, long: row?.config?.["daily-long"] ?? null };
}

function pickNiche(config: AgentConfig, kind: VideoFormat, date: string) {
  if (config.daily.niche !== "auto" && isKnownNiche(config.daily.niche)) return getNiche(config.daily.niche);
  // Rotate through niches day by day; factual niches only when a keyed story model exists.
  const pool = autoPickableNiches().filter((niche) => niche.fiction !== "never" || textModelConfigured());
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return pool[(day + (kind === "long" ? 3 : 0)) % Math.max(1, pool.length)] ?? getNiche("horror");
}

/** Creates + queues today's videos whose time has come. Returns what it created. */
export async function runDailySchedule(now = new Date()) {
  const config = await getConfig();
  const created: { kind: VideoFormat; id: string; niche: string }[] = [];
  if (!config.daily.short && !config.daily.long) return created;
  const { date, minutes } = localNow(now, config.timezone);
  for (const kind of ["short", "long"] as const) {
    if (!config.daily[kind]) continue;
    const [h, m] = (kind === "short" ? config.daily.shortTime : config.daily.longTime).split(":").map(Number);
    if (minutes < h * 60 + m) continue;
    if (!(await claimSlot(kind, date))) continue;
    const video = await createScheduledVideo(kind, config, date);
    created.push(video);
  }
  return created;
}

export async function createScheduledVideo(kind: VideoFormat, config: AgentConfig, date = new Date().toISOString().slice(0, 10), idea?: string, nicheId?: string) {
  const niche = nicheId && isKnownNiche(nicheId) ? getNiche(nicheId) : pickNiche(config, kind, date);
  const settings = normalizeVideoSettings({
    format: kind,
    targetDuration: kind === "long" ? config.daily.longMinutes * 60 : 45,
    style: niche.defaultStyle,
    audience: niche.audience,
    idea,
    autoPublish: config.autoPublishEnabled,
  });
  const video = await createVideo({ niche: niche.id, settings, audience: niche.audience });
  await enqueueJob(video.id, "story", `${kind === "long" ? "Daily Long" : "Daily Short"} (${niche.label}) queued.`);
  return { kind, id: video.id, niche: niche.id };
}
