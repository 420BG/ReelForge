import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getNiche } from "@/content/niches/registry";
import { generateStoryPlan } from "@/content/story-engine";
import type { AgentConfig, AgentJob, StoryPlan, VideoSettings } from "@/content/types";
import { generateVoiceStep } from "@/jobs/voice-generation";
import {
  extendLease, getAssets, getConfig, getVideoRow, logJob, normalizeVideoSettings, recentTitles, recordUsage, updateVideo, upsertAsset, usageToday, type AssetRow,
} from "@/jobs/repo";
import { publishAgentVideo } from "@/jobs/youtube-upload";
import { getAccount } from "@/lib/youtube";
import { composeFinal, planTimeline, renderSceneSegment, type ComposeScene } from "@/video/composition/compose";
import { ffmpegAvailable, probe } from "@/video/composition/ffmpeg";
import { validateFinal } from "@/video/composition/validate";
import { estimateCost, resolveProvider } from "@/video/providers";
import { pollinationsImage } from "@/video/providers/pollinations";
import { ProviderError, type VideoProvider } from "@/video/providers/types";
import { ensureScratch, fileExists, materialize, putFile, storageKey, storedLooksPresent } from "@/video/storage";
import { scenePrompt } from "@/video/storyboard";

export type StepOutcome = {
  state: "queued" | "waiting" | "done" | "failed";
  step?: AgentJob["step"];
  delaySeconds?: number;
  progress?: number;
  currentScene?: number | null;
  error?: string | null;
};

const WEIGHTS: Record<AgentJob["step"], [number, number]> = {
  story: [0, 5], voice: [5, 20], clips: [20, 70], audio: [70, 71], segments: [71, 88], compose: [88, 97], validate: [97, 99], publish: [99, 100], done: [100, 100],
};
const progressFor = (step: AgentJob["step"], fraction: number) => {
  const [from, to] = WEIGHTS[step];
  return Math.round(from + (to - from) * Math.max(0, Math.min(1, fraction)));
};
const backoffSeconds = (attempt: number) => Math.min(600, 20 * 2 ** Math.max(0, attempt - 1));
const due = (asset: AssetRow | undefined) => !asset?.next_attempt_at || new Date(asset.next_attempt_at).getTime() <= Date.now();

type Ctx = { job: AgentJob; videoId: string; story: StoryPlan | null; settings: VideoSettings; config: AgentConfig; row: Record<string, unknown> };

/* ---------------- story ---------------- */

async function storyStep(ctx: Ctx): Promise<StepOutcome> {
  if (ctx.story?.scenes?.length) return { state: "queued", step: "voice", progress: progressFor("story", 1) };
  const niche = getNiche(String(ctx.row.niche));
  await logJob(ctx.job.id, "info", `Writing ${niche.label} story (${ctx.settings.targetDuration}s)…`);
  const { plan, note } = await generateStoryPlan({
    niche: niche.id,
    subNiche: (ctx.row.sub_niche as string) ?? undefined,
    idea: ctx.settings.idea,
    targetDuration: ctx.settings.targetDuration,
    style: ctx.settings.style,
    maxScenes: ctx.config.maxScenesPerVideo,
    timezone: ctx.config.timezone,
    voiceGender: ctx.settings.voiceGender,
    avoidTitles: await recentTitles(20),
  });
  const warnings = Array.isArray(ctx.row.warnings) ? (ctx.row.warnings as string[]) : [];
  await updateVideo(ctx.videoId, { story: plan, title: plan.title, hook: plan.hook, sub_niche: plan.subNiche || null, warnings: note ? [...warnings, note] : warnings });
  await logJob(ctx.job.id, note ? "warn" : "info", note ?? `Story ready: “${plan.title}” — ${plan.scenes.length} scenes (${plan.source === "ai" ? plan.model : "template writer"}).`);
  return { state: "queued", step: "voice", progress: progressFor("story", 1) };
}

/* ---------------- clips ---------------- */

async function saveClip(ctx: Ctx, index: number, provider: VideoProvider, bytes: Buffer, mimeType: string, attempts: number) {
  const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("quicktime") ? "mov" : "mp4";
  const key = storageKey.clip(ctx.videoId, index, ext);
  const file = path.join(await ensureScratch(ctx.videoId), `clip-${index}.${ext}`);
  await writeFile(file, bytes);
  const info = await probe(file).catch(() => null);
  if (!info?.hasVideo || info.duration < 0.5) throw new ProviderError("The provider's file is not a playable video.", true);
  await putFile(key, file);
  const cost = estimateCost(provider.id, info.duration, ctx.config);
  await recordUsage(provider.id, info.duration, cost);
  await upsertAsset(ctx.videoId, index, "clip", { status: "done", mode: "video", provider: provider.id, path: key, provider_ref: null, error: null, attempts, meta: { duration: info.duration, width: info.width, height: info.height, cost } });
  await logJob(ctx.job.id, "info", `Scene ${index + 1}: ${info.duration.toFixed(1)}s AI video clip from ${provider.label}${cost != null ? ` (~$${cost})` : ""}.`);
}

async function failAsset(ctx: Ctx, index: number, kind: "clip" | "keyframe", attempts: number, error: unknown): Promise<StepOutcome> {
  const message = error instanceof Error ? error.message : String(error);
  const retryable = error instanceof ProviderError ? error.retryable : true;
  const exhausted = attempts >= ctx.config.maxAttemptsPerScene;
  if (retryable && !exhausted) {
    const wait = backoffSeconds(attempts);
    await upsertAsset(ctx.videoId, index, kind, { status: "failed", attempts, error: message, provider_ref: null, next_attempt_at: new Date(Date.now() + wait * 1000) });
    await logJob(ctx.job.id, "warn", `Scene ${index + 1} ${kind} attempt ${attempts} failed: ${message}. Retrying in ${wait}s.`);
    return { state: "waiting", step: "clips", delaySeconds: wait, currentScene: index };
  }
  await upsertAsset(ctx.videoId, index, kind, { status: "failed", attempts, error: message, provider_ref: null, next_attempt_at: null });
  const reason = `Scene ${index + 1} failed after ${attempts} attempt(s): ${message}`;
  await logJob(ctx.job.id, "error", reason);
  return { state: "failed", step: "clips", error: reason, currentScene: index };
}

async function clipsStep(ctx: Ctx): Promise<StepOutcome> {
  const story = ctx.story!;
  const provider = resolveProvider(ctx.settings, ctx.config);
  const imageMode = !provider && ctx.settings.allowImageMode && ctx.config.allowImageMode;
  if (!provider && !imageMode) {
    return { state: "failed", step: "clips", error: "Video provider not configured." + (ctx.settings.allowImageMode && !ctx.config.allowImageMode ? " (IMAGE MODE is also disabled in Agent settings.)" : "") };
  }
  await updateVideo(ctx.videoId, { provider: provider ? provider.id : "pollinations-image" });
  const clips = new Map((await getAssets(ctx.videoId, "clip")).map((asset) => [asset.scene_index, asset]));
  const keyframes = new Map((await getAssets(ctx.videoId, "keyframe")).map((asset) => [asset.scene_index, asset]));
  const total = story.scenes.length;
  const doneCount = story.scenes.filter((scene) => clips.get(scene.index)?.status === "done").length;
  let earliestRetry: number | null = null;

  for (const scene of story.scenes) {
    const i = scene.index;
    const asset = clips.get(i);
    if (asset?.status === "done" && (await storedLooksPresent(asset.path))) continue;
    const kidsSafe = ctx.settings.audience === "kids";
    const prompts = scenePrompt(story, scene, ctx.settings.style, kidsSafe);
    const attempts = (asset?.attempts ?? 0) + 1;

    // Poll an in-flight async generation.
    if (asset?.status === "running" && asset.provider_ref && provider?.poll) {
      try {
        const poll = await provider.poll(asset.provider_ref, ctx.config);
        if (poll.status === "pending") return { state: "waiting", step: "clips", delaySeconds: 12, currentScene: i, progress: progressFor("clips", doneCount / total) };
        if (poll.status === "failed") return failAsset(ctx, i, "clip", asset.attempts, new ProviderError(poll.error, poll.retryable));
        await saveClip(ctx, i, provider, poll.result.bytes, poll.result.mimeType, asset.attempts);
        return { state: "queued", step: "clips", currentScene: i, progress: progressFor("clips", (doneCount + 1) / total) };
      } catch (error) { return failAsset(ctx, i, "clip", asset.attempts, error); }
    }
    if (asset?.status === "failed" && asset.attempts >= ctx.config.maxAttemptsPerScene) {
      return { state: "failed", step: "clips", currentScene: i, error: `Scene ${i + 1} failed after ${asset.attempts} attempt(s): ${asset.error ?? "unknown error"}` };
    }
    if (!due(asset)) {
      const at = new Date(asset!.next_attempt_at!).getTime();
      earliestRetry = earliestRetry == null ? at : Math.min(earliestRetry, at);
      continue;
    }

    // Cost control: daily cap on generations.
    const usage = await usageToday();
    if (usage.clips >= ctx.config.dailyClipLimit) {
      await logJob(ctx.job.id, "warn", `Daily clip limit (${ctx.config.dailyClipLimit}) reached — paused. Raise it in Agent settings or wait until tomorrow.`);
      return { state: "waiting", step: "clips", delaySeconds: 3600, currentScene: i, error: "Paused: daily clip limit reached.", progress: progressFor("clips", doneCount / total) };
    }

    // IMAGE MODE (explicit opt-in only): a still per scene, animated later with camera motion.
    if (imageMode) {
      try {
        await upsertAsset(ctx.videoId, i, "clip", { status: "running", mode: "image", provider: "pollinations-image", attempts });
        const image = await pollinationsImage(prompts.keyframePrompt, prompts.seed + i, ctx.config);
        const key = storageKey.clip(ctx.videoId, i, "jpg");
        const file = path.join(await ensureScratch(ctx.videoId), `clip-${i}.jpg`);
        await writeFile(file, image.bytes);
        await putFile(key, file);
        await recordUsage("pollinations-image", 0, null);
        await upsertAsset(ctx.videoId, i, "clip", { status: "done", mode: "image", provider: "pollinations-image", path: key, error: null, attempts });
        await logJob(ctx.job.id, "info", `Scene ${i + 1}: IMAGE MODE still generated (not AI video).`);
        return { state: "queued", step: "clips", currentScene: i, progress: progressFor("clips", (doneCount + 1) / total) };
      } catch (error) { return failAsset(ctx, i, "clip", attempts, error); }
    }

    const videoProvider = provider!;
    // Character consistency: keyframe from a fixed character seed, then image-to-video (where supported).
    let imageDataUrl: string | undefined;
    const wantsKeyframe = ctx.settings.consistency && videoProvider.capabilities.imageToVideo && scene.characters.length > 0;
    if (wantsKeyframe) {
      const keyframe = keyframes.get(i);
      if (keyframe?.status === "done" && keyframe.path && (await storedLooksPresent(keyframe.path))) {
        imageDataUrl = `data:image/jpeg;base64,${(await readFile(await materialize(keyframe.path, ctx.videoId))).toString("base64")}`;
      } else if (!keyframe || keyframe.status !== "failed" || keyframe.attempts < ctx.config.maxAttemptsPerScene) {
        const kfAttempts = (keyframe?.attempts ?? 0) + 1;
        try {
          const image = await pollinationsImage(prompts.keyframePrompt, prompts.seed, ctx.config);
          const key = storageKey.keyframe(ctx.videoId, i);
          const file = path.join(await ensureScratch(ctx.videoId), `keyframe-${i}.jpg`);
          await writeFile(file, image.bytes);
          await putFile(key, file);
          await upsertAsset(ctx.videoId, i, "keyframe", { status: "done", mode: "image", provider: "pollinations-image", path: key, attempts: kfAttempts, error: null });
          await logJob(ctx.job.id, "info", `Scene ${i + 1}: character keyframe ready (seed ${prompts.seed}).`);
          return { state: "queued", step: "clips", currentScene: i, progress: progressFor("clips", doneCount / total) };
        } catch (error) {
          await upsertAsset(ctx.videoId, i, "keyframe", { status: "failed", attempts: kfAttempts, error: error instanceof Error ? error.message : String(error) });
          await logJob(ctx.job.id, "warn", `Scene ${i + 1}: keyframe failed, falling back to text-to-video.`);
        }
      }
    }

    try {
      await upsertAsset(ctx.videoId, i, "clip", { status: "running", mode: "video", provider: videoProvider.id, attempts, error: null, next_attempt_at: null });
      await logJob(ctx.job.id, "info", `Scene ${i + 1}/${total}: generating ${imageDataUrl ? "image-to-video" : "text-to-video"} clip with ${videoProvider.label} (attempt ${attempts})…`);
      const submission = await videoProvider.submit({
        prompt: prompts.prompt,
        negativePrompt: prompts.negativePrompt,
        durationSec: Math.min(ctx.config.maxClipSeconds, scene.duration > 6 && ctx.settings.quality === "production" ? 10 : 5),
        aspectRatio: "9:16",
        seed: prompts.seed,
        imageDataUrl,
        quality: ctx.settings.quality,
      }, ctx.config);
      if (submission.status === "pending") {
        await upsertAsset(ctx.videoId, i, "clip", { status: "running", provider_ref: submission.ref });
        return { state: "waiting", step: "clips", delaySeconds: 15, currentScene: i, progress: progressFor("clips", doneCount / total) };
      }
      await saveClip(ctx, i, videoProvider, submission.result.bytes, submission.result.mimeType, attempts);
      return { state: "queued", step: "clips", currentScene: i, progress: progressFor("clips", (doneCount + 1) / total) };
    } catch (error) {
      return failAsset(ctx, i, "clip", attempts, error);
    }
  }
  if (earliestRetry != null) return { state: "waiting", step: "clips", delaySeconds: Math.max(5, Math.ceil((earliestRetry - Date.now()) / 1000)), progress: progressFor("clips", doneCount / total) };
  return { state: "queued", step: "audio", progress: progressFor("clips", 1), currentScene: null };
}

/* ---------------- audio + compose + validate ---------------- */

async function audioStep(): Promise<StepOutcome> {
  if (!(await ffmpegAvailable())) return { state: "failed", step: "audio", error: "ffmpeg is not available on this server. On Vercel, make sure the ffmpeg-static package is installed; elsewhere install ffmpeg." };
  return { state: "queued", step: "segments", progress: progressFor("audio", 1) };
}

/** Scene list + timeline, shared by the segments and compose steps so both agree on lengths. */
async function composePlan(ctx: Ctx) {
  const story = ctx.story!;
  const clips = new Map((await getAssets(ctx.videoId, "clip")).map((asset) => [asset.scene_index, asset]));
  const voices = new Map((await getAssets(ctx.videoId, "voice")).map((asset) => [asset.scene_index, asset]));
  const scenes: (ComposeScene & { clipKey: string; clipStamp: string; voiceKey: string | null })[] = [];
  for (const scene of story.scenes) {
    const clip = clips.get(scene.index);
    if (!clip?.path || clip.status !== "done") return null;
    const voice = voices.get(scene.index);
    const voiceOk = voice?.status === "done" && Boolean(voice.path);
    scenes.push({
      index: scene.index,
      kind: clip.mode === "image" ? "image" : "video",
      source: clip.path,
      camera: scene.camera,
      atmosphere: scene.atmosphere,
      transition: scene.transition,
      narration: scene.narration,
      caption: scene.caption,
      voiceFile: voiceOk ? voice!.path : null,
      voiceDuration: voiceOk ? Number(voice!.meta?.duration) || 0 : 0,
      plannedDuration: scene.duration,
      sfx: scene.sfx,
      clipKey: clip.path,
      clipStamp: `${clip.path}|${new Date(clip.updated_at).getTime()}`,
      voiceKey: voiceOk ? voice!.path : null,
    });
  }
  const maxDuration = Math.max(ctx.settings.targetDuration + 10, 20);
  return { scenes, clips, timeline: planTimeline(scenes, maxDuration), maxDuration };
}

/** One scene segment per call (fits a serverless request). Re-renders only when its clip, length or look changed. */
async function segmentsStep(ctx: Ctx): Promise<StepOutcome> {
  const plan = await composePlan(ctx);
  if (!plan) return { state: "queued", step: "clips" };
  const niche = getNiche(ctx.story!.niche);
  const segments = new Map((await getAssets(ctx.videoId, "segment")).map((asset) => [asset.scene_index, asset]));
  const total = plan.scenes.length;
  for (const [i, scene] of plan.scenes.entries()) {
    const length = plan.timeline.entries[i].length;
    const signature = `${scene.clipStamp}|${length.toFixed(3)}|${niche.colorGrade}|${scene.camera}|${scene.atmosphere.join(",")}`;
    const existing = segments.get(scene.index);
    if (existing?.status === "done" && existing.meta?.signature === signature && (await storedLooksPresent(existing.path))) continue;
    await logJob(ctx.job.id, "info", `Rendering scene ${i + 1}/${total} (${length.toFixed(1)}s)…`);
    const source = await materialize(scene.clipKey, ctx.videoId);
    const out = path.join(await ensureScratch(ctx.videoId), `seg-${scene.index}.mp4`);
    await renderSceneSegment({ ...scene, source }, length, niche.colorGrade, out);
    const key = storageKey.segment(ctx.videoId, scene.index);
    await putFile(key, out);
    await upsertAsset(ctx.videoId, scene.index, "segment", { status: "done", mode: "video", path: key, error: null, meta: { signature, length } });
    return { state: "queued", step: "segments", currentScene: scene.index, progress: progressFor("segments", (i + 1) / total) };
  }
  return { state: "queued", step: "compose", progress: progressFor("segments", 1), currentScene: null };
}

/** Final pass: transitions, captions, audio mix, encode, cover, validation — then upload. */
async function composeStep(ctx: Ctx): Promise<StepOutcome> {
  const story = ctx.story!;
  const niche = getNiche(story.niche);
  const plan = await composePlan(ctx);
  if (!plan) return { state: "queued", step: "clips" };
  const segmentAssets = new Map((await getAssets(ctx.videoId, "segment")).map((asset) => [asset.scene_index, asset]));
  const scratch = await ensureScratch(ctx.videoId);
  const segments: string[] = [];
  for (const scene of plan.scenes) {
    const asset = segmentAssets.get(scene.index);
    if (!asset?.path || asset.status !== "done") return { state: "queued", step: "segments" };
    segments.push(await materialize(asset.path, ctx.videoId));
  }
  const scenes: ComposeScene[] = [];
  for (const scene of plan.scenes) scenes.push({ ...scene, voiceFile: scene.voiceKey ? await materialize(scene.voiceKey, ctx.videoId) : null });
  await logJob(ctx.job.id, "info", "Final mix: transitions, captions, voice, music and SFX…");
  const workDir = path.join(scratch, "final");
  const outFile = path.join(scratch, "final.mp4");
  const coverFile = path.join(scratch, "cover.jpg");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(workDir, { recursive: true });
  const result = await composeFinal({
    workDir, scenes, segments,
    grade: niche.colorGrade,
    ambience: ctx.settings.sfx ? niche.ambience : [],
    captions: ctx.settings.captions,
    captionsEnabled: true,
    hookText: story.scenes[0]?.onScreenText || "",
    coverTitle: story.seo.title || story.title,
    musicMood: ctx.settings.music ? story.musicMood : null,
    musicVolume: ctx.settings.musicVolume,
    sfxEnabled: ctx.settings.sfx,
    quality: ctx.settings.quality,
    maxDuration: plan.maxDuration,
    outFile, coverFile,
    onProgress: async (label) => { await extendLease(ctx.job.id, 330); await logJob(ctx.job.id, "info", label); },
  });
  const report = await validateFinal(outFile, { maxDuration: ctx.settings.targetDuration + 10, expectAudio: scenes.some((scene) => scene.voiceFile) });
  if (!report.ok) return { state: "failed", step: "compose", error: `Validation failed: ${report.errors.join(" ")}` };
  await putFile(storageKey.final(ctx.videoId), outFile);
  const hasCover = await fileExists(coverFile);
  if (hasCover) await putFile(storageKey.cover(ctx.videoId), coverFile);
  const modes = new Set(scenes.map((scene) => scene.kind));
  const renderMode = modes.size > 1 ? "mixed" : modes.has("image") ? "image" : "video";
  const prior = (Array.isArray(ctx.row.warnings) ? (ctx.row.warnings as string[]) : []).filter((w) => !/^Narration sped up|No synthesized sound|Final length|Cover image failed|IMAGE MODE|Duration .* above|No narration/.test(w));
  const costs = [...plan.clips.values()].map((clip) => Number(clip.meta?.cost)).filter((n) => Number.isFinite(n));
  await updateVideo(ctx.videoId, {
    final_path: storageKey.final(ctx.videoId),
    cover_path: hasCover ? storageKey.cover(ctx.videoId) : null,
    duration_sec: Math.round(result.duration * 10) / 10,
    render_mode: renderMode,
    warnings: Array.from(new Set([...prior, ...result.warnings, ...report.warnings, ...(renderMode !== "video" ? ["IMAGE MODE: some or all scenes are still images with camera motion, not AI video."] : [])])).slice(0, 20),
    cost_estimate: costs.length ? Math.round(costs.reduce((sum, n) => sum + n, 0) * 100) / 100 : null,
  });
  await logJob(ctx.job.id, "info", `Validated: ${report.width}×${report.height}, ${report.duration.toFixed(1)}s, ${(report.sizeBytes / 1e6).toFixed(1)} MB.`);
  return { state: "queued", step: "validate", progress: progressFor("compose", 1) };
}

/** Moves the finished video to REVIEW (or on to publish when auto-publish is explicitly on). */
async function validateStep(ctx: Ctx): Promise<StepOutcome> {
  if (!ctx.row.final_path) return { state: "queued", step: "segments" };
  const autopublish = ctx.config.autoPublishEnabled && ctx.settings.autoPublish && Boolean((await getAccount())?.refreshToken);
  await updateVideo(ctx.videoId, { workflow: autopublish ? "approved" : "review", error: null });
  await logJob(ctx.job.id, "info", autopublish ? "Auto-publish is on." : "Waiting for your review.");
  return autopublish ? { state: "queued", step: "publish", progress: progressFor("validate", 1) } : { state: "done", step: "done", progress: 100, currentScene: null };
}

async function publishStep(ctx: Ctx): Promise<StepOutcome> {
  const result = await publishAgentVideo(ctx.videoId, { requireApproved: false });
  await logJob(ctx.job.id, "info", `Published to YouTube (${ctx.row.privacy}): ${result.url}`);
  return { state: "done", step: "done", progress: 100, currentScene: null };
}

/** Runs exactly one unit of work for a job. Called by the runner under a lease. */
export async function runStep(job: AgentJob): Promise<StepOutcome> {
  const row = await getVideoRow(job.videoId);
  if (!row) return { state: "failed", error: "Video was deleted." };
  const config = await getConfig();
  const settings = normalizeVideoSettings(row.settings);
  if (row.workflow !== "processing") await updateVideo(job.videoId, { workflow: "processing", error: null });
  const ctx: Ctx = { job, videoId: job.videoId, story: (row.story as StoryPlan) ?? null, settings, config, row };
  if (job.step !== "story" && !ctx.story?.scenes?.length) return { state: "queued", step: "story" };
  switch (job.step) {
    case "story": return storyStep(ctx);
    case "voice": return generateVoiceStep(ctx.job, ctx.videoId, ctx.story!, settings, config, progressFor);
    case "clips": return clipsStep(ctx);
    case "audio": return audioStep();
    case "segments": return segmentsStep(ctx);
    case "compose": return composeStep(ctx);
    case "validate": return validateStep(ctx);
    case "publish": return publishStep(ctx);
    default: return { state: "done", step: "done", progress: 100 };
  }
}
