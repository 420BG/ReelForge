import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Agent media storage.
 *  - Supabase Storage (production on Vercel) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 *  - Local disk otherwise (Replit / local dev / tests).
 * The database stores storage KEYS like "<videoId>/scenes/clip-0.mp4", never absolute paths.
 * Work happens in a per-video scratch dir (/tmp on Vercel) and durable files are uploaded.
 * The existing `.renders` folder used by the legacy daily autopilot is untouched.
 */

const UUID = /^[0-9a-f-]{36}$/i;

export function storageBackend(): "supabase" | "local" {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local";
}

export function mediaRoot() {
  return process.env.AGENT_MEDIA_DIR || path.join(process.cwd(), ".media", "agent");
}

function checkId(videoId: string) {
  if (!UUID.test(videoId)) throw new Error("Invalid video id.");
}

export const storageKey = {
  clip: (videoId: string, index: number, ext = "mp4") => (checkId(videoId), `${videoId}/scenes/clip-${index}.${ext}`),
  keyframe: (videoId: string, index: number) => (checkId(videoId), `${videoId}/scenes/keyframe-${index}.jpg`),
  voice: (videoId: string, index: number) => (checkId(videoId), `${videoId}/audio/voice-${index}.mp3`),
  segment: (videoId: string, index: number) => (checkId(videoId), `${videoId}/segments/seg-${index}.mp4`),
  part: (videoId: string, index: number) => (checkId(videoId), `${videoId}/parts/part-${index}.mp4`),
  final: (videoId: string) => (checkId(videoId), `${videoId}/final.mp4`),
  cover: (videoId: string) => (checkId(videoId), `${videoId}/cover.jpg`),
};

const CONTENT_TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp3: "audio/mpeg", wav: "audio/wav" };
export const contentTypeFor = (key: string) => CONTENT_TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** Per-video scratch directory for the current request (ephemeral on Vercel). */
export function scratchDir(videoId: string) {
  checkId(videoId);
  return process.env.VERCEL ? path.join(tmpdir(), "agent", videoId) : path.join(mediaRoot(), videoId, "work");
}

export async function ensureScratch(videoId: string) {
  const dir = scratchDir(videoId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function clearScratch(videoId: string) {
  try { await rm(scratchDir(videoId), { recursive: true, force: true }); } catch { /* nothing to clear */ }
}

export async function fileExists(file: string) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

/* ---------------- Supabase Storage REST (server-only; service key never reaches the browser) ---------------- */

/** Same bucket ReelForge already uses; agent files live under the "agent/" folder. */
const bucket = () => process.env.AGENT_STORAGE_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || "videos";
const PREFIX = "agent/";
const sbBase = () => `${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/storage/v1`;
const sbHeaders = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: String(process.env.SUPABASE_SERVICE_ROLE_KEY), ...extra });
const encodeKey = (key: string) => `${PREFIX}${key}`.split("/").map(encodeURIComponent).join("/");

let bucketReady: Promise<void> | null = null;
function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const check = await fetch(`${sbBase()}/bucket/${encodeURIComponent(bucket())}`, { headers: sbHeaders(), cache: "no-store" });
      if (check.ok) return;
      if (check.status !== 404 && check.status !== 400) return; // unknown state: don't try to create; uploads will report any real problem
      const create = await fetch(`${sbBase()}/bucket`, {
        method: "POST", headers: sbHeaders({ "Content-Type": "application/json" }), cache: "no-store",
        body: JSON.stringify({ id: bucket(), name: bucket(), public: false }),
      });
      if (!create.ok && create.status !== 409) {
        const text = (await create.text().catch(() => "")).slice(0, 200);
        if (!/already exists/i.test(text)) throw new Error(`Could not create Supabase bucket "${bucket()}" (${create.status}): ${text}`);
      }
    })().catch((error) => { bucketReady = null; throw error; });
  }
  return bucketReady;
}

async function sbUpload(key: string, bytes: Buffer, contentType: string) {
  await ensureBucket();
  const response = await fetch(`${sbBase()}/object/${encodeURIComponent(bucket())}/${encodeKey(key)}`, {
    method: "POST", headers: sbHeaders({ "Content-Type": contentType, "x-upsert": "true", "cache-control": "no-cache" }), body: new Uint8Array(bytes), cache: "no-store",
  });
  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Supabase upload failed for ${key} (${response.status}). ${/size|large|413/i.test(text + response.status) ? "File exceeds the bucket's size limit. " : ""}${text}`);
  }
}

async function sbDownload(key: string): Promise<Buffer> {
  const response = await fetch(`${sbBase()}/object/authenticated/${encodeURIComponent(bucket())}/${encodeKey(key)}`, { headers: sbHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error(`Supabase download failed for ${key} (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function sbList(prefix: string): Promise<string[]> {
  const response = await fetch(`${sbBase()}/object/list/${encodeURIComponent(bucket())}`, {
    method: "POST", headers: sbHeaders({ "Content-Type": "application/json" }), cache: "no-store",
    body: JSON.stringify({ prefix: `${PREFIX}${prefix}`, limit: 1000, offset: 0 }),
  });
  if (!response.ok) return [];
  const items = (await response.json().catch(() => [])) as { name: string; id: string | null }[];
  return items.filter((item) => item.id).map((item) => `${prefix}/${item.name}`);
}

/* ---------------- Backend-agnostic API ---------------- */

/** Local path of a key on the local backend; null on Supabase. */
export function localPathFor(key: string) {
  return storageBackend() === "local" ? path.join(mediaRoot(), key) : null;
}

/** Stores a local file under `key`. */
export async function putFile(key: string, localFile: string) {
  if (storageBackend() === "supabase") return sbUpload(key, await readFile(localFile), contentTypeFor(key));
  const target = path.join(mediaRoot(), key);
  if (path.resolve(target) === path.resolve(localFile)) return;
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(localFile, target);
}

export async function putBytes(key: string, bytes: Buffer) {
  if (storageBackend() === "supabase") return sbUpload(key, bytes, contentTypeFor(key));
  const target = path.join(mediaRoot(), key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

/** Returns a local file for `key`, downloading into scratch when stored remotely. */
export async function materialize(key: string, videoId: string) {
  const local = localPathFor(key);
  if (local) {
    if (!(await fileExists(local))) throw new Error(`Stored file is missing: ${key}`);
    return local;
  }
  const target = path.join(await ensureScratch(videoId), "dl", key.replace(/\//g, "__"));
  if (await fileExists(target)) return target;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await sbDownload(key));
  return target;
}

export async function readStored(key: string) {
  const local = localPathFor(key);
  return local ? readFile(local) : sbDownload(key);
}

/** Cheap existence check: stats local files; on Supabase the DB status is trusted (no network call). */
export async function storedLooksPresent(key: string | null | undefined) {
  if (!key) return false;
  const local = localPathFor(key);
  return local ? fileExists(local) : true;
}

/** Short-lived signed URL for the browser (Supabase only). Local backend returns null → stream through the app. */
export async function signedUrl(key: string, seconds = 900, downloadName?: string) {
  if (storageBackend() !== "supabase") return null;
  const response = await fetch(`${sbBase()}/object/sign/${encodeURIComponent(bucket())}/${encodeKey(key)}`, {
    method: "POST", headers: sbHeaders({ "Content-Type": "application/json" }), cache: "no-store", body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { signedURL?: string; signedUrl?: string };
  const relative = data.signedURL ?? data.signedUrl;
  if (!relative) return null;
  const url = new URL(`${sbBase()}${relative.startsWith("/") ? "" : "/"}${relative}`);
  if (downloadName) url.searchParams.set("download", downloadName);
  return url.toString();
}

export async function removeVideoMedia(videoId: string) {
  checkId(videoId);
  if (storageBackend() === "supabase") {
    try {
      const keys = [
        ...(await sbList(`${videoId}/scenes`)), ...(await sbList(`${videoId}/audio`)), ...(await sbList(`${videoId}/segments`)), ...(await sbList(`${videoId}/parts`)), ...(await sbList(videoId)),
      ];
      if (keys.length) {
        await fetch(`${sbBase()}/object/${encodeURIComponent(bucket())}`, { method: "DELETE", headers: sbHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: keys.map((key) => `${PREFIX}${key}`) }), cache: "no-store" });
      }
    } catch { /* best effort */ }
  } else {
    try { await rm(path.join(mediaRoot(), videoId), { recursive: true, force: true }); } catch { /* already gone */ }
  }
  await clearScratch(videoId);
}
