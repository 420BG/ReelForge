import { date, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { AutoSettings, EditorSettings, StoryScene } from "@/lib/types";
import { DEFAULT_EDITOR_SETTINGS } from "@/lib/types";

export const studioOwner = pgTable("studio_owner", {
  id: integer("id").primaryKey().default(1),
  pinHash: text("pin_hash").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studioSessions = pgTable("studio_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("studio_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  idea: text("idea").notNull(),
  category: text("category").notNull().default("Adventure"),
  ageGroup: text("age_group").notNull().default("3–5 years"),
  duration: integer("duration").notNull().default(30),
  style: text("style").notNull().default("Storybook"),
  character: text("character").notNull().default("fox"),
  scenes: jsonb("scenes").$type<StoryScene[]>().notNull().default([]),
  editSettings: jsonb("edit_settings").$type<EditorSettings>().notNull().default(DEFAULT_EDITOR_SETTINGS),
  status: text("status").notNull().default("draft"),
  thumbnail: text("thumbnail"),
  youtubeTitle: text("youtube_title").notNull().default(""),
  description: text("description").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  privacy: text("privacy").notNull().default("private"),
  youtubeVideoId: text("youtube_video_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studioIntegrations = pgTable("studio_integrations", {
  id: integer("id").primaryKey().default(1),
  youtubeRefreshToken: text("youtube_refresh_token"),
  youtubeChannelTitle: text("youtube_channel_title"),
  youtubeChannelId: text("youtube_channel_id"),
  youtubeChannelAvatar: text("youtube_channel_avatar"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studioSettings = pgTable("studio_settings", {
  id: integer("id").primaryKey().default(1),
  secrets: jsonb("secrets").$type<Record<string, string>>().notNull().default({}),
  auto: jsonb("auto").$type<AutoSettings>().notNull().default({ enabled: false, autoPost: false, visibility: "private", lastRunDate: null }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
