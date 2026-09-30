import { pool } from "@/db";
import { ensureAgentSchema } from "@/db/agent-schema";
import {
  DEFAULT_AGENT_CONFIG, DEFAULT_CAPTIONS, DEFAULT_VIDEO_SETTINGS,
  type AgentConfig, type AgentJob, type AgentVideo, type SceneAsset, type StoryPlan, type VideoSettings, type Workflow,
} from "@/content/types";
import { storedLooksPresent } from "@/video/storage";

/* All queries are parameterised. Nothing here deletes rows except deleteVideo (explicit user action). */

type Row = Record<string, unknown>;
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : "");

export async function q<T extends Row = Row>(sql: string, params: unknown[] = []) {
  await ensureAgentSchema();
  return (await pool.query(sql, params)).rows as T[];
}

/* ---------------- settings ---------------- */

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function normalizeConfig(input: unknown): AgentConfig {
  const value = (typeof input === "object" && input !== null ? input : {}) as Partial<AgentConfig> & Record<string, unknown>;
  const models = (value.models ?? {}) as Partial<AgentConfig["models"]>;
  const price = (value.pricePerSecond ?? {}) as Partial<AgentConfig["pricePerSecond"]>;
  const priceOf = (v: unknown) => (v === null || v === "" || v === undefined ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
  const extra = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const text = (v: unknown, fallback: string) => (typeof v === "string" ? v.trim().slice(0, 120) : fallback);
  return {
    maxVideosPerBatch: clampInt(value.maxVideosPerBatch, 1, 30, DEFAULT_AGENT_CONFIG.maxVideosPerBatch),
    maxScenesPerVideo: clampInt(value.maxScenesPerVideo, 3, 12, DEFAULT_AGENT_CONFIG.maxScenesPerVideo),
    maxAttemptsPerScene: clampInt(value.maxAttemptsPerScene, 1, 6, DEFAULT_AGENT_CONFIG.maxAttemptsPerScene),
    maxClipSeconds: [5, 10].includes(Number(value.maxClipSeconds)) ? Number(value.maxClipSeconds) : DEFAULT_AGENT_CONFIG.maxClipSeconds,
    dailyClipLimit: clampInt(value.dailyClipLimit, 1, 500, DEFAULT_AGENT_CONFIG.dailyClipLimit),
    autoPublishEnabled: value.autoPublishEnabled === true,
    allowImageMode: value.allowImageMode === true,
    defaultProvider: ["auto", "pollinations", "fal", "replicate"].includes(String(value.defaultProvider)) ? (value.defaultProvider as AgentConfig["defaultProvider"]) : "auto",
    models: {
      pollinations: { video: text(models.pollinations?.video, ""), image: text(models.pollinations?.image, "flux") || "flux" },
      fal: { textToVideo: text(models.fal?.textToVideo, DEFAULT_AGENT_CONFIG.models.fal.textToVideo), imageToVideo: text(models.fal?.imageToVideo, DEFAULT_AGENT_CONFIG.models.fal.imageToVideo), extraInput: extra(models.fal?.extraInput) },
      replicate: { textToVideo: text(models.replicate?.textToVideo, DEFAULT_AGENT_CONFIG.models.replicate.textToVideo), imageToVideo: text(models.replicate?.imageToVideo, DEFAULT_AGENT_CONFIG.models.replicate.imageToVideo), extraInput: extra(models.replicate?.extraInput) },
    },
    pricePerSecond: { pollinations: priceOf(price.pollinations), fal: priceOf(price.fal), replicate: priceOf(price.replicate) },
    timezone: typeof value.timezone === "string" && /^[A-Za-z_]+\/[A-Za-z_/-]+$|^UTC$/.test(value.timezone) ? value.timezone : DEFAULT_AGENT_CONFIG.timezone,
  };
}

export async function getConfig(): Promise<AgentConfig> {
  const [row] = await q<{ config: unknown }>("SELECT config FROM agent_settings WHERE id = 1");
  return normalizeConfig(row?.config ?? {});
}

export async function saveConfig(patch: Partial<AgentConfig>): Promise<AgentConfig> {
  const current = await getConfig();
  const next = normalizeConfig({ ...current, ...patch, models: { ...current.models, ...(patch.models ?? {}) }, pricePerSecond: { ...current.pricePerSecond, ...(patch.pricePerSecond ?? {}) } });
  await q("INSERT INTO agent_settings (id, config, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()", [JSON.stringify(next)]);
  return next;
}

export function normalizeVideoSettings(input: unknown, base: VideoSettings = DEFAULT_VIDEO_SETTINGS): VideoSettings {
  const value = (typeof input === "object" && input !== null ? input : {}) as Partial<VideoSettings>;
  const captions = { ...DEFAULT_CAPTIONS, ...base.captions, ...(typeof value.captions === "object" && value.captions ? value.captions : {}) };
  const hex = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(v as T) ? (v as T) : fallback);
  return {
    targetDuration: clampInt(value.targetDuration ?? base.targetDuration, 10, 60, 30),
    style: pick(value.style ?? base.style, ["cinematic", "dark-cinematic", "animation-3d", "anime", "realistic", "storybook"] as const, "cinematic"),
    voiceGender: pick(value.voiceGender ?? base.voiceGender, ["female", "male", "auto"] as const, "auto"),
    voiceProvider: pick(value.voiceProvider ?? base.voiceProvider, ["auto", "free", "pollinations", "elevenlabs", "none"] as const, "auto"),
    voiceId: typeof (value.voiceId ?? base.voiceId) === "string" && /^[a-zA-Z0-9_-]{2,80}$/.test(String(value.voiceId ?? base.voiceId)) ? String(value.voiceId ?? base.voiceId) : undefined,
    quality: pick(value.quality ?? base.quality, ["draft", "production"] as const, "production"),
    provider: pick(value.provider ?? base.provider, ["auto", "pollinations", "fal", "replicate"] as const, "auto"),
    allowImageMode: Boolean(value.allowImageMode ?? base.allowImageMode),
    consistency: (value.consistency ?? base.consistency) !== false,
    captions: {
      font: typeof captions.font === "string" ? captions.font.slice(0, 60) : "auto",
      size: clampInt(captions.size, 48, 140, DEFAULT_CAPTIONS.size),
      position: pick(captions.position, ["bottom", "center", "top"] as const, "bottom"),
      animation: pick(captions.animation, ["pop", "karaoke", "fade", "none"] as const, "pop"),
      color: hex(captions.color, DEFAULT_CAPTIONS.color),
      highlight: hex(captions.highlight, DEFAULT_CAPTIONS.highlight),
      hookTitle: captions.hookTitle !== false,
    },
    music: (value.music ?? base.music) !== false,
    sfx: (value.sfx ?? base.sfx) !== false,
    musicVolume: clampInt(value.musicVolume ?? base.musicVolume, 0, 100, 35),
    audience: pick(value.audience ?? base.audience, ["general", "kids"] as const, "general"),
    autoPublish: Boolean(value.autoPublish ?? base.autoPublish),
    privacy: pick(value.privacy ?? base.privacy, ["private", "unlisted", "public"] as const, "private"),
    idea: typeof (value.idea ?? base.idea) === "string" ? String(value.idea ?? base.idea).slice(0, 400) : undefined,
  };
}

/* ---------------- videos ---------------- */

async function serializeVideo(row: Row): Promise<AgentVideo> {
  const id = String(row.id);
  return {
    id,
    niche: String(row.niche),
    subNiche: (row.sub_niche as string) ?? null,
    title: String(row.title ?? ""),
    hook: (row.hook as string) ?? null,
    story: (row.story as StoryPlan) ?? null,
    settings: normalizeVideoSettings(row.settings),
    audience: row.audience === "kids" ? "kids" : "general",
    workflow: row.workflow as Workflow,
    renderMode: (row.render_mode as AgentVideo["renderMode"]) ?? null,
    provider: (row.provider as string) ?? null,
    hasFinal: await storedLooksPresent(row.final_path as string | null),
    hasCover: await storedLooksPresent(row.cover_path as string | null),
    durationSec: row.duration_sec == null ? null : Number(row.duration_sec),
    youtubeVideoId: (row.youtube_video_id as string) ?? null,
    privacy: (row.privacy as AgentVideo["privacy"]) ?? "private",
    batchId: (row.batch_id as string) ?? null,
    error: (row.error as string) ?? null,
    warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
    costEstimate: row.cost_estimate == null ? null : Number(row.cost_estimate),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function serializeJob(row: Row): AgentJob {
  return {
    id: String(row.id),
    videoId: String(row.video_id),
    state: row.state as AgentJob["state"],
    step: row.step as AgentJob["step"],
    progress: Number(row.progress) || 0,
    currentScene: row.current_scene == null ? null : Number(row.current_scene),
    attempts: Number(row.attempts) || 0,
    error: (row.error as string) ?? null,
    log: Array.isArray(row.log) ? (row.log as AgentJob["log"]).slice(-40) : [],
    nextRunAt: iso(row.next_run_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function serializeAsset(row: Row): SceneAsset {
  return {
    sceneIndex: Number(row.scene_index),
    kind: row.kind as SceneAsset["kind"],
    status: row.status as SceneAsset["status"],
    mode: (row.mode as SceneAsset["mode"]) ?? null,
    provider: (row.provider as string) ?? null,
    attempts: Number(row.attempts) || 0,
    error: (row.error as string) ?? null,
    updatedAt: iso(row.updated_at),
    meta: (row.meta as Record<string, unknown>) ?? {},
  };
}

export async function createVideo(input: { niche: string; subNiche?: string | null; settings: VideoSettings; story?: StoryPlan | null; batchId?: string | null; audience: "general" | "kids" }) {
  const story = input.story ?? null;
  const [row] = await q(
    `INSERT INTO agent_videos (niche, sub_niche, title, hook, story, settings, audience, workflow, privacy, batch_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9) RETURNING *`,
    [input.niche, input.subNiche ?? null, story?.title ?? "", story?.hook ?? null, story ? JSON.stringify(story) : null, JSON.stringify(input.settings), input.audience, input.settings.privacy, input.batchId ?? null],
  );
  return serializeVideo(row);
}

export async function getVideoRow(id: string) {
  const [row] = await q("SELECT * FROM agent_videos WHERE id = $1", [id]);
  return row ?? null;
}

export async function getVideo(id: string, withDetails = true): Promise<AgentVideo | null> {
  const row = await getVideoRow(id);
  if (!row) return null;
  const video = await serializeVideo(row);
  if (withDetails) {
    const [job] = await q("SELECT * FROM agent_jobs WHERE video_id = $1 ORDER BY created_at DESC LIMIT 1", [id]);
    video.job = job ? serializeJob(job) : null;
    video.assets = (await q("SELECT * FROM agent_scene_assets WHERE video_id = $1 ORDER BY scene_index, kind", [id])).map(serializeAsset);
  }
  return video;
}

export async function listVideos(workflow?: string, limit = 60): Promise<AgentVideo[]> {
  const rows = workflow && workflow !== "all"
    ? await q("SELECT * FROM agent_videos WHERE workflow = $1 ORDER BY updated_at DESC LIMIT $2", [workflow, limit])
    : await q("SELECT * FROM agent_videos ORDER BY updated_at DESC LIMIT $1", [limit]);
  const videos = await Promise.all(rows.map(serializeVideo));
  const ids = videos.map((video) => video.id);
  if (ids.length) {
    const jobs = await q("SELECT DISTINCT ON (video_id) * FROM agent_jobs WHERE video_id = ANY($1::uuid[]) ORDER BY video_id, created_at DESC", [ids]);
    const byVideo = new Map(jobs.map((job) => [String(job.video_id), serializeJob(job)]));
    for (const video of videos) video.job = byVideo.get(video.id) ?? null;
  }
  return videos;
}

export async function updateVideo(id: string, patch: Partial<{ title: string; sub_niche: string | null; hook: string | null; story: StoryPlan | null; settings: VideoSettings; workflow: Workflow; render_mode: string | null; provider: string | null; final_path: string | null; cover_path: string | null; duration_sec: number | null; youtube_video_id: string | null; privacy: string; error: string | null; warnings: string[]; cost_estimate: number | null; audience: string }>) {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const sets = entries.map(([key], i) => `${key} = $${i + 2}`);
  const values = entries.map(([key, value]) => (["story", "settings", "warnings"].includes(key) && value !== null ? JSON.stringify(value) : value));
  await q(`UPDATE agent_videos SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, [id, ...values]);
}

export async function deleteVideo(id: string) {
  await q("DELETE FROM agent_videos WHERE id = $1", [id]);
}

export async function recentTitles(limit = 30) {
  return (await q<{ title: string }>("SELECT title FROM agent_videos WHERE title <> '' ORDER BY created_at DESC LIMIT $1", [limit])).map((row) => row.title);
}

export async function workflowCounts() {
  const rows = await q<{ workflow: string; count: string }>("SELECT workflow, count(*)::text AS count FROM agent_videos GROUP BY workflow");
  const counts: Record<string, number> = { draft: 0, processing: 0, review: 0, approved: 0, published: 0, failed: 0 };
  for (const row of rows) counts[row.workflow] = Number(row.count);
  return { ...counts, total: Object.values(counts).reduce((sum, n) => sum + n, 0) };
}

/** Videos created today / this week (owner timezone) and videos currently in the queue. */
export async function activityCounts(timezone: string) {
  const tz = /^[A-Za-z_]+\/[A-Za-z_/-]+$|^UTC$/.test(timezone) ? timezone : "UTC";
  const [row] = await q<{ today: string; week: string; queue: string }>(
    `SELECT
       count(*) FILTER (WHERE (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date)::text AS today,
       count(*) FILTER (WHERE created_at >= now() - interval '7 days')::text AS week,
       (SELECT count(*) FROM agent_jobs WHERE state IN ('queued','running','waiting'))::text AS queue
     FROM agent_videos`,
    [tz],
  );
  return { today: Number(row?.today ?? 0), week: Number(row?.week ?? 0), queue: Number(row?.queue ?? 0) };
}

/* ---------------- jobs ---------------- */

export async function activeJobFor(videoId: string) {
  const [row] = await q("SELECT * FROM agent_jobs WHERE video_id = $1 AND state IN ('queued','running','waiting') ORDER BY created_at DESC LIMIT 1", [videoId]);
  return row ? serializeJob(row) : null;
}

/** Queues production. Re-uses an existing job row so history/log is kept; never duplicates an active job. */
export async function enqueueJob(videoId: string, step: AgentJob["step"], note: string) {
  const active = await activeJobFor(videoId);
  if (active) return active;
  const [last] = await q("SELECT id FROM agent_jobs WHERE video_id = $1 ORDER BY created_at DESC LIMIT 1", [videoId]);
  const entry = JSON.stringify([{ at: new Date().toISOString(), level: "info", message: note }]);
  if (last) {
    const [row] = await q(`UPDATE agent_jobs SET state='queued', step=$2, error=NULL, attempts=0, ticks=0, next_run_at=now(), locked_until=NULL, finished_at=NULL, log = log || $3::jsonb, updated_at=now() WHERE id=$1 RETURNING *`, [last.id, step, entry]);
    return serializeJob(row);
  }
  const [row] = await q(`INSERT INTO agent_jobs (video_id, state, step, log) VALUES ($1,'queued',$2,$3::jsonb) RETURNING *`, [videoId, step, entry]);
  return serializeJob(row);
}

export async function cancelJobs(videoId: string) {
  await q("UPDATE agent_jobs SET state='cancelled', locked_until=NULL, updated_at=now(), finished_at=now() WHERE video_id=$1 AND state IN ('queued','running','waiting')", [videoId]);
}

/**
 * Claims one due job with a lease. Expired leases on 'running' jobs are reclaimed,
 * which is how a crashed/restarted server resumes work (partial job recovery).
 */
export async function claimJob(owner: string, leaseSeconds: number) {
  const [row] = await q(
    `UPDATE agent_jobs SET state='running', lease_owner=$1, locked_until = now() + ($2 || ' seconds')::interval, ticks = ticks + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM agent_jobs
       WHERE state IN ('queued','running','waiting') AND next_run_at <= now() AND (locked_until IS NULL OR locked_until < now())
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
     ) RETURNING *`,
    [owner, String(leaseSeconds)],
  );
  return row ? { job: serializeJob(row), ticks: Number(row.ticks) } : null;
}

export async function releaseJob(id: string, patch: { state: AgentJob["state"]; step?: AgentJob["step"]; delaySeconds?: number; progress?: number; currentScene?: number | null; error?: string | null; attempts?: number }) {
  await q(
    `UPDATE agent_jobs SET state=$2, step=COALESCE($3, step), next_run_at = now() + ($4 || ' seconds')::interval, locked_until=NULL,
       progress=COALESCE($5, progress), current_scene=$6, error=$7, attempts=COALESCE($8, attempts), updated_at=now(),
       finished_at = CASE WHEN $2 IN ('done','failed','cancelled') THEN now() ELSE NULL END
     WHERE id=$1`,
    [id, patch.state, patch.step ?? null, String(Math.max(0, patch.delaySeconds ?? 0)), patch.progress ?? null, patch.currentScene ?? null, patch.error ?? null, patch.attempts ?? null],
  );
}

export async function extendLease(id: string, seconds: number) {
  await q("UPDATE agent_jobs SET locked_until = now() + ($2 || ' seconds')::interval WHERE id = $1", [id, String(seconds)]);
}

export async function logJob(id: string, level: "info" | "warn" | "error", message: string) {
  const entry = JSON.stringify([{ at: new Date().toISOString(), level, message: message.slice(0, 500) }]);
  await q("UPDATE agent_jobs SET log = (CASE WHEN jsonb_array_length(log) > 150 THEN log - 0 ELSE log END) || $2::jsonb, updated_at=now() WHERE id=$1", [id, entry]);
}

export async function activeJobs() {
  const rows = await q(`SELECT j.*, v.title, v.niche, v.provider FROM agent_jobs j JOIN agent_videos v ON v.id = j.video_id WHERE j.state IN ('queued','running','waiting') ORDER BY j.created_at ASC LIMIT 20`);
  return rows.map((row) => ({ ...serializeJob(row), title: String(row.title || "Untitled"), niche: String(row.niche), provider: (row.provider as string) ?? null }));
}

export async function recentFailures(limit = 8) {
  const rows = await q(`SELECT j.*, v.title FROM agent_jobs j JOIN agent_videos v ON v.id = j.video_id WHERE j.state = 'failed' ORDER BY j.updated_at DESC LIMIT $1`, [limit]);
  return rows.map((row) => ({ ...serializeJob(row), title: String(row.title || "Untitled") }));
}

/* ---------------- scene assets ---------------- */

export type AssetRow = { video_id: string; scene_index: number; kind: string; status: string; mode: string | null; provider: string | null; path: string | null; provider_ref: string | null; attempts: number; next_attempt_at: Date | null; error: string | null; meta: Record<string, unknown>; updated_at: string | Date };

export async function getAssets(videoId: string, kind?: string) {
  return kind
    ? q<AssetRow>("SELECT * FROM agent_scene_assets WHERE video_id=$1 AND kind=$2 ORDER BY scene_index", [videoId, kind])
    : q<AssetRow>("SELECT * FROM agent_scene_assets WHERE video_id=$1 ORDER BY scene_index, kind", [videoId]);
}

export async function upsertAsset(videoId: string, sceneIndex: number, kind: string, patch: Partial<{ status: string; mode: string | null; provider: string | null; path: string | null; provider_ref: string | null; attempts: number; next_attempt_at: Date | null; error: string | null; meta: Record<string, unknown> }>) {
  await q(
    `INSERT INTO agent_scene_assets (video_id, scene_index, kind, status, mode, provider, path, provider_ref, attempts, next_attempt_at, error, meta)
     VALUES ($1,$2,$3,COALESCE($4,'pending'),$5,$6,$7,$8,COALESCE($9,0),$10,$11,COALESCE($12,'{}'::jsonb))
     ON CONFLICT (video_id, scene_index, kind) DO UPDATE SET
       status = COALESCE($4, agent_scene_assets.status),
       mode = CASE WHEN $13 THEN $5 ELSE agent_scene_assets.mode END,
       provider = CASE WHEN $14 THEN $6 ELSE agent_scene_assets.provider END,
       path = CASE WHEN $15 THEN $7 ELSE agent_scene_assets.path END,
       provider_ref = CASE WHEN $16 THEN $8 ELSE agent_scene_assets.provider_ref END,
       attempts = COALESCE($9, agent_scene_assets.attempts),
       next_attempt_at = CASE WHEN $17 THEN $10 ELSE agent_scene_assets.next_attempt_at END,
       error = CASE WHEN $18 THEN $11 ELSE agent_scene_assets.error END,
       meta = CASE WHEN $12::jsonb IS NULL THEN agent_scene_assets.meta ELSE agent_scene_assets.meta || $12::jsonb END,
       updated_at = now()`,
    [
      videoId, sceneIndex, kind, patch.status ?? null, patch.mode ?? null, patch.provider ?? null, patch.path ?? null, patch.provider_ref ?? null,
      patch.attempts ?? null, patch.next_attempt_at ?? null, patch.error ?? null, patch.meta ? JSON.stringify(patch.meta) : null,
      "mode" in patch, "provider" in patch, "path" in patch, "provider_ref" in patch, "next_attempt_at" in patch, "error" in patch,
    ],
  );
}

/** Marks scene assets for regeneration without touching the others. */
export async function resetAssets(videoId: string, sceneIndexes: number[], kinds: string[]) {
  await q(
    `UPDATE agent_scene_assets SET status='pending', attempts=0, error=NULL, provider_ref=NULL, next_attempt_at=NULL, updated_at=now()
     WHERE video_id=$1 AND scene_index = ANY($2::int[]) AND kind = ANY($3::text[])`,
    [videoId, sceneIndexes, kinds],
  );
}

export async function resetFailedAssets(videoId: string) {
  await q(`UPDATE agent_scene_assets SET status='pending', attempts=0, error=NULL, provider_ref=NULL, next_attempt_at=NULL, updated_at=now() WHERE video_id=$1 AND status='failed'`, [videoId]);
}

export async function dropAssetsBeyond(videoId: string, sceneCount: number) {
  await q("DELETE FROM agent_scene_assets WHERE video_id=$1 AND scene_index >= $2", [videoId, sceneCount]);
}

/* ---------------- usage / cost ---------------- */

export async function recordUsage(provider: string, seconds: number, cost: number | null) {
  await q(
    `INSERT INTO agent_usage (day, provider, clips, seconds, cost) VALUES (CURRENT_DATE, $1, 1, $2, $3)
     ON CONFLICT (day, provider) DO UPDATE SET clips = agent_usage.clips + 1, seconds = agent_usage.seconds + $2, cost = agent_usage.cost + $3`,
    [provider, seconds, cost ?? 0],
  );
}

export async function usageToday() {
  const rows = await q<{ provider: string; clips: number; seconds: number; cost: number }>("SELECT provider, clips, seconds, cost FROM agent_usage WHERE day = CURRENT_DATE");
  return { clips: rows.reduce((sum, row) => sum + Number(row.clips), 0), cost: rows.reduce((sum, row) => sum + Number(row.cost), 0), byProvider: rows };
}

export async function createBatch(config: Record<string, unknown>) {
  const [row] = await q<{ id: string }>("INSERT INTO agent_batches (config) VALUES ($1) RETURNING id", [JSON.stringify(config)]);
  return row.id;
}
