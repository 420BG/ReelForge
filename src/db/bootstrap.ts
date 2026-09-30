import { pool } from "@/db";

const globalForSchema = globalThis as typeof globalThis & {
  __littleloopSchemaReady?: Promise<void>;
};

/**
 * Keeps a fresh preview database usable before Drizzle push runs.
 * Drizzle remains the source of truth; these IF NOT EXISTS statements only
 * protect the app from a clean managed-preview database at boot.
 */
export function ensureStudioSchema() {
  if (globalForSchema.__littleloopSchemaReady) return globalForSchema.__littleloopSchemaReady;
  globalForSchema.__littleloopSchemaReady = (async () => {
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS studio_owner (
        id integer PRIMARY KEY DEFAULT 1,
        pin_hash text NOT NULL,
        failed_attempts integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS studio_sessions (
        token_hash text PRIMARY KEY,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS studio_projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        idea text NOT NULL,
        category text NOT NULL DEFAULT 'Adventure',
        age_group text NOT NULL DEFAULT '3–5 years',
        duration integer NOT NULL DEFAULT 30,
        style text NOT NULL DEFAULT 'Storybook',
        character text NOT NULL DEFAULT 'fox',
        scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
        edit_settings jsonb NOT NULL DEFAULT '{"captionStyle":"storybook","music":"playful","musicVolume":28,"voiceVolume":90,"voiceProvider":"pollinations","voiceId":"af_heart"}'::jsonb,
        status text NOT NULL DEFAULT 'draft',
        thumbnail text,
        youtube_title text NOT NULL DEFAULT '',
        description text NOT NULL DEFAULT '',
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        privacy text NOT NULL DEFAULT 'private',
        youtube_video_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS studio_integrations (
        id integer PRIMARY KEY DEFAULT 1,
        youtube_refresh_token text,
        youtube_channel_title text,
        youtube_channel_id text,
        youtube_channel_avatar text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE studio_projects
        ADD COLUMN IF NOT EXISTS edit_settings jsonb NOT NULL DEFAULT '{"captionStyle":"storybook","music":"playful","musicVolume":28,"voiceVolume":90,"voiceProvider":"pollinations","voiceId":"af_heart"}'::jsonb;

      CREATE TABLE IF NOT EXISTS studio_settings (
        id integer PRIMARY KEY DEFAULT 1,
        secrets jsonb NOT NULL DEFAULT '{}'::jsonb,
        auto jsonb NOT NULL DEFAULT '{"enabled":false,"autoPost":false,"visibility":"private","lastRunDate":null}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  })().catch((error) => {
    globalForSchema.__littleloopSchemaReady = undefined;
    throw error;
  });
  return globalForSchema.__littleloopSchemaReady;
}
