import { pool } from "@/db";
import { ensureStudioSchema } from "@/db/bootstrap";

const globalForAgent = globalThis as typeof globalThis & { __agentSchemaReady?: Promise<void> };

/**
 * ADDITIVE ONLY: creates the Shorts-agent tables if they don't exist.
 * Never drops, renames or alters existing tables or data. Constraint names match
 * the Drizzle definitions in schema.ts so a future `drizzle-kit push` sees no diff.
 */
export function ensureAgentSchema() {
  if (globalForAgent.__agentSchemaReady) return globalForAgent.__agentSchemaReady;
  globalForAgent.__agentSchemaReady = (async () => {
    await ensureStudioSchema();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_settings (
        id integer PRIMARY KEY DEFAULT 1,
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS agent_batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS agent_videos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        niche text NOT NULL,
        sub_niche text,
        title text NOT NULL DEFAULT '',
        hook text,
        story jsonb,
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        audience text NOT NULL DEFAULT 'general',
        workflow text NOT NULL DEFAULT 'draft',
        render_mode text,
        provider text,
        final_path text,
        cover_path text,
        duration_sec real,
        youtube_video_id text,
        privacy text NOT NULL DEFAULT 'private',
        batch_id uuid,
        error text,
        warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
        cost_estimate real,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS agent_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        video_id uuid NOT NULL,
        state text NOT NULL DEFAULT 'queued',
        step text NOT NULL DEFAULT 'story',
        progress real NOT NULL DEFAULT 0,
        current_scene integer,
        attempts integer NOT NULL DEFAULT 0,
        ticks integer NOT NULL DEFAULT 0,
        next_run_at timestamptz NOT NULL DEFAULT now(),
        locked_until timestamptz,
        lease_owner text,
        error text,
        log jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        CONSTRAINT agent_jobs_video_id_agent_videos_id_fk FOREIGN KEY (video_id) REFERENCES agent_videos(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS agent_jobs_state_next_idx ON agent_jobs (state, next_run_at);

      CREATE TABLE IF NOT EXISTS agent_scene_assets (
        video_id uuid NOT NULL,
        scene_index integer NOT NULL,
        kind text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        mode text,
        provider text,
        path text,
        provider_ref text,
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz,
        error text,
        meta jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT agent_scene_assets_video_id_scene_index_kind_pk PRIMARY KEY (video_id, scene_index, kind),
        CONSTRAINT agent_scene_assets_video_id_agent_videos_id_fk FOREIGN KEY (video_id) REFERENCES agent_videos(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_usage (
        day date NOT NULL,
        provider text NOT NULL,
        clips integer NOT NULL DEFAULT 0,
        seconds real NOT NULL DEFAULT 0,
        cost real NOT NULL DEFAULT 0,
        CONSTRAINT agent_usage_day_provider_pk PRIMARY KEY (day, provider)
      );
    `);
  })().catch((error) => {
    globalForAgent.__agentSchemaReady = undefined;
    throw error;
  });
  return globalForAgent.__agentSchemaReady;
}
