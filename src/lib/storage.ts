import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "videos";

const globalForSupabase = globalThis as typeof globalThis & {
  __arenaSupabase?: ReturnType<typeof createClient>;
};

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required");
  }
  if (!globalForSupabase.__arenaSupabase) {
    globalForSupabase.__arenaSupabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return globalForSupabase.__arenaSupabase;
}

/** Upload a local file to Supabase Storage. Returns the storage object key. */
export async function uploadToSupabase(
  localPath: string,
  remoteKey: string,
  contentType: string,
): Promise<string> {
  const buf = await fs.readFile(localPath);
  const { error } = await client()
    .storage.from(BUCKET)
    .upload(remoteKey, buf, { contentType, upsert: true });
  if (error) throw new Error(`supabase upload failed (${remoteKey}): ${error.message}`);
  return remoteKey;
}

/** Create a temporary signed URL for a stored object (default: 1 hour). */
export async function getSignedUrl(remoteKey: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await client()
    .storage.from(BUCKET)
    .createSignedUrl(remoteKey, expiresIn);
  if (error || !data) throw new Error(`supabase signed url failed (${remoteKey}): ${error?.message}`);
  return data.signedUrl;
}

/** Delete one or more stored objects. Best-effort — never throws. */
export async function deleteFromSupabase(remoteKeys: (string | null | undefined)[]): Promise<void> {
  const keys = remoteKeys.filter((k): k is string => Boolean(k));
  if (keys.length === 0) return;
  try {
    await client().storage.from(BUCKET).remove(keys);
  } catch (err) {
    console.error("supabase delete failed", err);
  }
}

/** Download a stored object to a local path (used to hand a rendered video to the YouTube uploader). */
export async function downloadToFile(remoteKey: string, localPath: string): Promise<void> {
  const { data, error } = await client().storage.from(BUCKET).download(remoteKey);
  if (error || !data) throw new Error(`supabase download failed (${remoteKey}): ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, buf);
}
