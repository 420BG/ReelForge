import { randomBytes } from "node:crypto";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StoryPlan } from "@/content/types";
import { upsertAsset } from "@/jobs/repo";
import { modelCandidates } from "@/lib/models";
import { ffmpegReport, probe, runFfmpeg } from "@/video/composition/ffmpeg";
import { ensureScratch, putBytes, putFile, readStored, removeStored, storageKey } from "@/video/storage";

/**
 * Your own media in the editor: a clip or image for a scene, a voice recording for a scene,
 * or one narration file for the whole video.
 *
 * Files arrive in small chunks (Vercel accepts ~4.5 MB per request), are assembled on the server,
 * then AUTO-ADJUSTED so they drop straight into the edit:
 *   - video  → H.264 MP4, ≤1080p, 30 fps, sound removed, first 60 s (the renderer crops it to the frame
 *              and fits it to the narration length);
 *   - image  → JPEG (camera motion is added by the renderer, like an AI image);
 *   - voice  → silence trimmed, loudness levelled, MP3 (the scene's length follows it);
 *   - full narration → levelled, then cut into one piece per scene at natural pauses.
 * Uploaded assets are marked provider "upload" and are never replaced by AI unless you ask.
 */

export type UploadKind = "clip" | "voice" | "narration";
export const UPLOAD_PROVIDER = "upload";
/** Under Vercel's ~4.5 MB request limit. */
export const CHUNK_BYTES = 3_500_000;
export const MAX_BYTES: Record<UploadKind, number> = { clip: 120_000_000, voice: 40_000_000, narration: 80_000_000 };
const MAX_CLIP_SECONDS = 60;

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif"];
const VIDEO_EXT = ["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp"];
const AUDIO_EXT = ["mp3", "m4a", "wav", "aac", "ogg", "oga", "opus", "flac", "webm", "mp4", "caf", "amr", "3gp"];

export const extOf = (name: string) => (/\.([a-z0-9]{2,5})$/i.exec(name.trim())?.[1] ?? "").toLowerCase();

/** What an upload is, from its name and browser MIME type. Throws a message the editor can show. */
export function classifyUpload(kind: UploadKind, name: string, mime: string): { ext: string; media: "image" | "video" | "audio" } {
  const ext = extOf(name);
  const type = mime.toLowerCase();
  if (kind === "clip") {
    if (type.startsWith("image/") || (!type.startsWith("video/") && IMAGE_EXT.includes(ext))) return { ext: IMAGE_EXT.includes(ext) ? ext : "jpg", media: "image" };
    if (type.startsWith("video/") || VIDEO_EXT.includes(ext)) return { ext: VIDEO_EXT.includes(ext) ? ext : "mp4", media: "video" };
    throw new Error("Upload a video (MP4/MOV) or an image (JPG/PNG) for the scene.");
  }
  if (type.startsWith("audio/") || type.startsWith("video/") || AUDIO_EXT.includes(ext)) return { ext: AUDIO_EXT.includes(ext) ? ext : "m4a", media: "audio" };
  throw new Error("Upload an audio file (MP3, M4A or WAV) for the narration.");
}

export function newUploadToken(kind: UploadKind, scene: number) {
  return `${kind}-${scene}-${randomBytes(6).toString("hex")}`;
}

export function parseUploadToken(token: string): { kind: UploadKind; scene: number } | null {
  const match = /^(clip|voice|narration)-(\d{1,4})-[a-f0-9]{12}$/.exec(token);
  return match ? { kind: match[1] as UploadKind, scene: Number(match[2]) } : null;
}

export async function saveUploadChunk(videoId: string, token: string, index: number, bytes: Buffer) {
  const parsed = parseUploadToken(token);
  if (!parsed) throw new Error("Invalid upload token.");
  if (!Number.isInteger(index) || index < 0 || index >= Math.ceil(MAX_BYTES[parsed.kind] / CHUNK_BYTES)) throw new Error("Invalid chunk number.");
  if (!bytes.length || bytes.length > CHUNK_BYTES + 200_000) throw new Error("Chunk is empty or too large.");
  await putBytes(storageKey.uploadChunk(videoId, token, index), bytes);
}

/** Joins the chunks into one local file and deletes them from storage. */
export async function assembleUpload(videoId: string, token: string, chunks: number, ext: string) {
  const parsed = parseUploadToken(token);
  if (!parsed) throw new Error("Invalid upload token.");
  if (!Number.isInteger(chunks) || chunks < 1 || chunks > Math.ceil(MAX_BYTES[parsed.kind] / CHUNK_BYTES)) throw new Error("Invalid chunk count.");
  const file = path.join(await ensureScratch(videoId), `upload-${token}.${ext.replace(/[^a-z0-9]/g, "") || "bin"}`);
  await writeFile(file, Buffer.alloc(0));
  const keys = Array.from({ length: chunks }, (_, i) => storageKey.uploadChunk(videoId, token, i));
  try {
    for (const key of keys) await appendFile(file, await readStored(key).catch(() => { throw new Error("Part of the upload is missing — please upload the file again."); }));
  } finally {
    await removeStored(keys);
  }
  return file;
}

/* ---------------- auto-adjust ---------------- */

/** A clip or image you uploaded for one scene → ready-to-edit asset. */
export async function ingestClip(videoId: string, scene: number, file: string, media: "image" | "video", name: string) {
  const scratch = await ensureScratch(videoId);
  if (media === "image") {
    const out = path.join(scratch, `upload-keyframe-${scene}.jpg`);
    await runFfmpeg(["-i", file, "-frames:v", "1", "-vf", "scale='min(2400,iw)':'min(2400,ih)':force_original_aspect_ratio=decrease,format=yuvj420p", "-q:v", "3", out], 60_000)
      .catch(() => { throw new Error("That image couldn't be read. Try a JPG or PNG."); });
    const info = await probe(out);
    if (!info.width || !info.height || Math.min(info.width, info.height) < 200) throw new Error("That image is too small (needs at least 200 px on the short side).");
    const key = storageKey.keyframe(videoId, scene);
    await putFile(key, out);
    const meta = { upload: true, name: name.slice(0, 120), width: info.width, height: info.height };
    await upsertAsset(videoId, scene, "keyframe", { status: "done", mode: "image", provider: UPLOAD_PROVIDER, path: key, error: null, attempts: 0, next_attempt_at: null, provider_ref: null, meta });
    await upsertAsset(videoId, scene, "clip", { status: "done", mode: "image", provider: UPLOAD_PROVIDER, path: key, error: null, attempts: 0, next_attempt_at: null, provider_ref: null, meta: { ...meta, from: "upload" } });
    return { mode: "image" as const, width: info.width, height: info.height, duration: 0 };
  }
  const source = await probe(file).catch(() => null);
  if (!source?.hasVideo || source.duration < 0.5) throw new Error("That file isn't a playable video (it needs to be at least half a second long).");
  const out = path.join(scratch, `upload-clip-${scene}.mp4`);
  await runFfmpeg([
    "-i", file, "-t", String(MAX_CLIP_SECONDS), "-an",
    "-vf", "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30,format=yuv420p",
    // Bitrate is capped so a full 60 s clip stays well under Supabase's 50 MB per-file limit on the free plan.
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-maxrate", "4500k", "-bufsize", "9000k", "-movflags", "+faststart", out,
  ], 220_000).catch((error) => { throw new Error(`That video couldn't be converted (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"}). Try an MP4 or a shorter clip.`); });
  const info = await probe(out);
  if (!info.hasVideo || info.duration < 0.5) throw new Error("That video couldn't be converted. Try an MP4.");
  const key = storageKey.clip(videoId, scene, "mp4");
  await putFile(key, out);
  await upsertAsset(videoId, scene, "clip", { status: "done", mode: "video", provider: UPLOAD_PROVIDER, path: key, error: null, attempts: 0, next_attempt_at: null, provider_ref: null, meta: { upload: true, name: name.slice(0, 120), duration: info.duration, width: info.width, height: info.height, trimmed: source.duration > MAX_CLIP_SECONDS + 0.5 } });
  return { mode: "video" as const, width: info.width, height: info.height, duration: info.duration };
}

const TRIM_ENDS = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.18,areverse";
const LEVEL = "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100";

async function normalizeVoice(input: string, out: string) {
  await runFfmpeg(["-i", input, "-vn", "-af", `${TRIM_ENDS},${LEVEL}`, "-ac", "1", "-c:a", "libmp3lame", "-b:a", "160k", out], 180_000)
    .catch(() => { throw new Error("That audio couldn't be read. Try an MP3, M4A or WAV file."); });
  const info = await probe(out).catch(() => null);
  if (!info?.hasAudio || info.duration < 0.3) throw new Error("That recording is silent or too short.");
  return info.duration;
}

async function saveVoice(videoId: string, scene: number, file: string, duration: number, name: string, extra: Record<string, unknown> = {}) {
  const key = storageKey.voice(videoId, scene);
  await putFile(key, file);
  await upsertAsset(videoId, scene, "voice", { status: "done", mode: "audio", provider: UPLOAD_PROVIDER, path: key, error: null, attempts: 0, next_attempt_at: null, provider_ref: null, meta: { upload: true, name: name.slice(0, 120), duration, voiceId: "your recording", ...extra } });
}

/** Your recording for ONE scene: trimmed, levelled, and the scene's length now follows it. */
export async function ingestVoice(videoId: string, scene: number, file: string, name: string) {
  const out = path.join(await ensureScratch(videoId), `upload-voice-${scene}.mp3`);
  const duration = await normalizeVoice(file, out);
  if (duration > 300) throw new Error("A single scene's recording can be at most 5 minutes. Use “Upload full narration” for a whole video.");
  await saveVoice(videoId, scene, out, duration, name);
  return { duration, file: out };
}

/** Pauses in a recording (start/end seconds), found with ffmpeg's silencedetect. */
export async function findPauses(file: string) {
  const report = await ffmpegReport(["-i", file, "-af", "silencedetect=noise=-34dB:d=0.22", "-f", "null", "-"], 120_000).catch(() => "");
  const pauses: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (const line of report.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    const e = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    if (e && start != null) { pauses.push({ start, end: Number(e[1]) }); start = null; }
  }
  return pauses;
}

/**
 * Where to cut one narration into `weights.length` pieces: each cut starts at the point the
 * script says it should be (by word count) and snaps to the nearest natural pause.
 */
export function planCuts(duration: number, weights: number[], pauses: { start: number; end: number }[]) {
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  const mids = pauses.map((pause) => (pause.start + pause.end) / 2).filter((t) => t > 0.3 && t < duration - 0.3);
  const cuts: number[] = [];
  let acc = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    acc += weights[i];
    const target = (duration * acc) / total;
    const floor = (cuts[i - 1] ?? 0) + 0.4;
    const ceiling = duration - 0.4 * (weights.length - 1 - i);
    const window = Math.max(1.2, (duration / weights.length) * 0.45);
    let best = target;
    let bestGap = Infinity;
    for (const mid of mids) {
      const gap = Math.abs(mid - target);
      if (gap <= window && gap < bestGap && mid >= floor && mid <= ceiling) { best = mid; bestGap = gap; }
    }
    cuts.push(Math.min(Math.max(best, floor), Math.max(floor, ceiling)));
  }
  return cuts;
}

/** ONE narration file for the whole video → one voice piece per scene, cut at natural pauses. */
export async function ingestNarration(videoId: string, story: StoryPlan, file: string, name: string) {
  const scratch = await ensureScratch(videoId);
  const full = path.join(scratch, "upload-narration.mp3");
  const duration = await normalizeVoice(file, full);
  const scenes = story.scenes;
  if (duration < scenes.length * 0.6) throw new Error(`That recording is only ${duration.toFixed(1)}s — too short to cover ${scenes.length} scenes.`);
  const weights = scenes.map((scene) => Math.max(1, scene.narration.trim().split(/\s+/).filter(Boolean).length));
  const cuts = planCuts(duration, weights, await findPauses(full));
  const edges = [0, ...cuts, duration];
  const pieces: { scene: number; duration: number; file: string }[] = [];
  for (const [i, scene] of scenes.entries()) {
    const out = path.join(scratch, `upload-voice-${scene.index}.mp3`);
    await runFfmpeg(["-i", full, "-ss", edges[i].toFixed(3), "-to", edges[i + 1].toFixed(3), "-af", "afade=t=in:d=0.02,aresample=44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "160k", out], 60_000);
    const info = await probe(out);
    await saveVoice(videoId, scene.index, out, info.duration, name, { fromFullNarration: true });
    pieces.push({ scene: scene.index, duration: info.duration, file: out });
  }
  await rm(full, { force: true }).catch(() => undefined);
  return { duration, pieces };
}

/* ---------------- auto-subtitles (speech → text) ---------------- */

const clean = (text: unknown) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "");

/**
 * Writes the subtitle text from a recording. Free tiers only, in order: Groq Whisper → Deepgram → Gemini.
 * Returns null when no speech-to-text key is set or all are busy (the subtitle text you typed is kept).
 */
export async function transcribe(file: string): Promise<{ text: string; provider: string } | null> {
  const bytes = await readFile(file);
  if (!bytes.length || bytes.length > 24_000_000) return null;
  const signal = () => AbortSignal.timeout(45_000);
  if (process.env.GROQ_API_KEY) {
    for (const model of [process.env.GROQ_STT_MODEL, "whisper-large-v3-turbo", "whisper-large-v3"].filter(Boolean) as string[]) {
      try {
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), "audio.mp3");
        form.append("model", model);
        form.append("response_format", "json");
        const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form, signal: signal(), cache: "no-store" });
        if (response.ok) { const text = clean((await response.json())?.text); if (text) return { text, provider: `groq:${model}` }; break; }
        if (response.status !== 404 && response.status !== 400) break;
      } catch { break; }
    }
  }
  if (process.env.DEEPGRAM_API_KEY) {
    try {
      const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true", { method: "POST", headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "audio/mpeg" }, body: new Uint8Array(bytes), signal: signal(), cache: "no-store" });
      if (response.ok) { const text = clean((await response.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript); if (text) return { text, provider: "deepgram" }; }
    } catch { /* next */ }
  }
  if (process.env.GEMINI_API_KEY && bytes.length < 14_000_000) {
    for (const model of modelCandidates("gemini").slice(0, 3)) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, signal: signal(), cache: "no-store",
          body: JSON.stringify({ contents: [{ parts: [{ text: "Transcribe this narration word for word in its original language. Return only the transcript, no notes." }, { inline_data: { mime_type: "audio/mpeg", data: bytes.toString("base64") } }] }], generationConfig: { temperature: 0 } }),
        });
        if (response.ok) {
          const parts = (await response.json())?.candidates?.[0]?.content?.parts ?? [];
          const text = clean(parts.map((part: { text?: string; thought?: boolean }) => (part.thought ? "" : part.text ?? "")).join(" "));
          if (text) return { text, provider: `gemini:${model}` };
          break;
        }
        if (response.status !== 404 && response.status !== 400) break;
      } catch { break; }
    }
  }
  return null;
}

export const speechToTextAvailable = () => Boolean(process.env.GROQ_API_KEY || process.env.DEEPGRAM_API_KEY || process.env.GEMINI_API_KEY);
