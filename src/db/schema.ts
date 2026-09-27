import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  serial,
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
