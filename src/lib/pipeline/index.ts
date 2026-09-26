import path from "node:path";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { NicheId, VoiceId, StyleId } from "@/lib/generator";
import { genScript } from "./script";
import { narrate } from "./tts";
import { sceneImage } from "./images";
import { renderVideo, STORAGE, ensureStorage } from "./render";
import { uploadToYouTube } from "./upload";
import { getAccount } from "@/lib/youtube";
import { uploadToSupabase } from "@/lib/storage";
import fs from "node:fs/promises";

export type ProviderTrail = {
  script?: string;
  images?: string;
  voice?: string;
  upload?: string;
};

async function setVideo(id: string, values: Record<string, unknown>) {
  await db.update(videos).set(values).where(eq(videos.id, id));
}

const running = new Set<string>();

export async function runPipeline(videoId: string): Promise<void> {
  if (running.has(videoId)) return;
  running.add(videoId);
  const trail: ProviderTrail = {};

  try {
    await ensureStorage();
    const [v] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (!v) return;

    /* ── 1. script ─────────────────────────────────────────── */
    await setVideo(videoId, { status: "script" });
    const script = await genScript({
      topic: v.topic,
      niche: v.niche as NicheId | "custom",
      format: v.format as "short" | "long",
    });
    trail.script = script.provider;
    await setVideo(videoId, {
      title: script.title,
      description: script.description,
      tags: script.tags,
      script: { scenes: script.scenes },
      providers: trail,
    });

    /* ── 2. media: images + narration per scene ────────────── */
    await setVideo(videoId, { status: "media" });
    const workDir = path.join(STORAGE, "videos", videoId);
    await fs.mkdir(workDir, { recursive: true });

    const scenes: { text: string; imgPath: string; audioPath: string | null }[] = [];
    const imgProviders = new Set<string>();
    let ttsProvider: string | null = null;

    for (let i = 0; i < script.scenes.length; i++) {
      const text = script.scenes[i];
      const [img, tts] = await Promise.all([
        sceneImage({
          sceneText: text,
          niche: v.niche as NicheId | "custom",
          format: v.format as "short" | "long",
          index: i,
          videoId,
          workDir,
        }),
        narrate(text, v.voice as VoiceId, path.join(workDir, `voice_${i}.mp3`)),
      ]);
      imgProviders.add(img.provider);
      ttsProvider = ttsProvider ?? tts.provider;
      scenes.push({ text, imgPath: img.imgPath, audioPath: tts.provider ? path.join(workDir, `voice_${i}.mp3`) : null });
      await setVideo(videoId, {
        providers: {
          ...trail,
          images: [...imgProviders].join(", "),
          voice: ttsProvider ?? "captions-only",
        },
      });
    }
    trail.images = [...imgProviders].join(", ");
    trail.voice = ttsProvider ?? "captions-only";

    /* ── 3. render ─────────────────────────────────────────── */
    await setVideo(videoId, { status: "render" });
    const out = await renderVideo({
      videoId,
      format: v.format as "short" | "long",
      style: v.style as StyleId,
      scenes,
    });
    const localVideoPath = path.join(STORAGE, out.videoRel);
    const localThumbPath = path.join(STORAGE, out.thumbRel);

    /* ── 4. persist to Supabase Storage ───────────────────── */
    await setVideo(videoId, { status: "upload" });
    const videoKey = await uploadToSupabase(localVideoPath, `${videoId}/video.mp4`, "video/mp4");
    let thumbKey: string | null = null;
    try {
      thumbKey = await uploadToSupabase(localThumbPath, `${videoId}/thumb.jpg`, "image/jpeg");
    } catch {
      /* thumbnail is best-effort */
    }
    await setVideo(videoId, {
      videoRel: videoKey,
      thumbRel: thumbKey,
      durationSec: out.durationSec,
      status: "rendered",
    });

    /* ── 5. upload to YouTube ──────────────────────────────── */
    if (v.autoUpload === 1) {
      const acc = await getAccount();
      if (!acc) {
        trail.upload = "skipped (not connected)";
        await setVideo(videoId, { providers: trail });
      } else {
        await setVideo(videoId, { status: "upload" });
        const res = await uploadToYouTube({
          filePath: localVideoPath,
          title: script.title,
          description: `${script.description}\n\n${script.tags.map((t) => `#${String(t).replace(/\s+/g, "")}`).join(" ")}`,
          tags: script.tags.map(String),
          privacy: v.privacy as "private" | "unlisted" | "public",
        });
        trail.upload = "youtube";
        await setVideo(videoId, {
          youtubeId: res.id,
          postedAt: new Date(),
          status: "posted",
          providers: trail,
        });
      }
    }

    /* ── 6. clean up local scratch files ──────────────────── */
    await fs.rm(path.join(STORAGE, "videos", videoId), { recursive: true, force: true }).catch(() => {});
    await fs.rm(localVideoPath, { force: true }).catch(() => {});
    await fs.rm(localThumbPath, { force: true }).catch(() => {});
  } catch (err) {
    console.error(`pipeline ${videoId} failed:`, err);
    await setVideo(videoId, {
      status: "failed",
      error: err instanceof Error ? err.message.slice(0, 500) : "unknown error",
    });
  } finally {
    running.delete(videoId);
  }
}
