import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  serial,
  date,
  index,
  primaryKey,
  real,
} from "drizzle-orm/pg-core";

export const generations = pgTable("generations", {
  id: uuid("id").defaultRandom().primaryKey(),
  topic: text("topic").notNull(),
  niche: text("niche").notNull(),
  voice: text("voice").notNull(),
  style: text("style").notNull(),
  title: text("title").notNull(),
  score: integer("score").notNull(),
  duration: integer("duration").notNull(), // milliseconds
  scenes: jsonb("scenes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type GenerationRow = typeof generations.$inferSelect;

export const waitlist = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  source: text("source").notNull().default("site"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type WaitlistRow = typeof waitlist.$inferSelect;

/* ── personal autopilot tables ─────────────────────────────── */

export const series = pgTable("series", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  niche: text("niche").notNull(),
  voice: text("voice").notNull(),
  style: text("style").notNull(),
  format: text("format").notNull().default("short"), // short | long
  frequency: text("frequency").notNull().default("daily"), // daily | weekly
  privacy: text("privacy").notNull().default("private"), // private | unlisted | public
  autopilot: integer("autopilot").notNull().default(0), // 0/1
  autoUpload: integer("auto_upload").notNull().default(0), // 0/1
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SeriesRow = typeof series.$inferSelect;

export const videos = pgTable("videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  seriesId: uuid("series_id"),
  topic: text("topic").notNull(),
  title: text("title").notNull().default("Pending"),
  description: text("description").notNull().default(""),
  tags: jsonb("tags").notNull().default([]),
  niche: text("niche").notNull(),
  voice: text("voice").notNull(),
  style: text("style").notNull(),
  format: text("format").notNull().default("short"),
  privacy: text("privacy").notNull().default("private"),
  autoUpload: integer("auto_upload").notNull().default(0),
  status: text("status").notNull().default("queued"),
  // queued → script → media → render → upload → posted | rendered | failed
  error: text("error"),
  script: jsonb("script"),
  durationSec: integer("duration_sec"),
  videoRel: text("video_rel"),
  thumbRel: text("thumb_rel"),
  providers: jsonb("providers").notNull().default({}),
  youtubeId: text("youtube_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }),
});

export type VideoRow = typeof videos.$inferSelect;

export const providerUsage = pgTable("provider_usage", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD (UTC)
  calls: integer("calls").notNull().default(0),
  failures: integer("failures").notNull().default(0),
  exhausted: integer("exhausted").notNull().default(0), // 0/1
});

export const youtubeAccounts = pgTable("youtube_accounts", {
  id: serial("id").primaryKey(),
  channelTitle: text("channel_title"),
  channelId: text("channel_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiryDate: text("expiry_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type YouTubeAccountRow = typeof youtubeAccounts.$inferSelect;

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  dailyGoal: integer("daily_goal").notNull().default(3),
  timezone: text("timezone").notNull().default("Asia/Kathmandu"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AppSettingsRow = typeof appSettings.$inferSelect;

/* ------------------------------------------------------------------
 * Shorts agent tables (additive). Mirrors src/db/agent-schema.ts, which
 * creates them with IF NOT EXISTS at runtime. Declared here so that a
 * future `drizzle-kit push` keeps them instead of proposing to drop them.
 * ------------------------------------------------------------------ */

export const agentSettings = pgTable("agent_settings", {
  id: integer("id").primaryKey().default(1),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentBatches = pgTable("agent_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentVideos = pgTable("agent_videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  niche: text("niche").notNull(),
  subNiche: text("sub_niche"),
  title: text("title").notNull().default(""),
  hook: text("hook"),
  story: jsonb("story").$type<Record<string, unknown>>(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  audience: text("audience").notNull().default("general"),
  workflow: text("workflow").notNull().default("draft"),
  renderMode: text("render_mode"),
  provider: text("provider"),
  finalPath: text("final_path"),
  coverPath: text("cover_path"),
  durationSec: real("duration_sec"),
  youtubeVideoId: text("youtube_video_id"),
  privacy: text("privacy").notNull().default("private"),
  batchId: uuid("batch_id"),
  error: text("error"),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  costEstimate: real("cost_estimate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentJobs = pgTable("agent_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id").notNull().references(() => agentVideos.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("queued"),
  step: text("step").notNull().default("story"),
  progress: real("progress").notNull().default(0),
  currentScene: integer("current_scene"),
  attempts: integer("attempts").notNull().default(0),
  ticks: integer("ticks").notNull().default(0),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  leaseOwner: text("lease_owner"),
  error: text("error"),
  log: jsonb("log").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [index("agent_jobs_state_next_idx").on(table.state, table.nextRunAt)]);

export const agentSceneAssets = pgTable("agent_scene_assets", {
  videoId: uuid("video_id").notNull().references(() => agentVideos.id, { onDelete: "cascade" }),
  sceneIndex: integer("scene_index").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  mode: text("mode"),
  provider: text("provider"),
  path: text("path"),
  providerRef: text("provider_ref"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  error: text("error"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.videoId, table.sceneIndex, table.kind] })]);

export const agentUsage = pgTable("agent_usage", {
  day: date("day").notNull(),
  provider: text("provider").notNull(),
  clips: integer("clips").notNull().default(0),
  seconds: real("seconds").notNull().default(0),
  cost: real("cost").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.day, table.provider] })]);
