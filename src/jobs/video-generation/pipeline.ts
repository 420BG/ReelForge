import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getNiche } from "@/content/niches/registry";
import { generateStoryPlan } from "@/content/story-engine";
import { canWriteLong, generateLongOutline, generateNextPart, storyComplete } from "@/content/story-engine/long";
import { outlineFromScript, writeScriptPart } from "@/content/story-engine/script";
import { aspectOf, type AgentConfig, type AgentJob, type PlanScene, type StoryPlan, type VideoSettings } from "@/content/types";
import { generateVoiceStep } from "@/jobs/voice-generation";
import {
  extendLease, getAssets, getConfig, getVideoRow, logJob, normalizeVideoSettings, recentTitles, recordUsage, updateVideo, upsertAsset, usageToday, type AssetRow,
} from "@/jobs/repo";
import { publishAgentVideo } from "@/jobs/youtube-upload";
import { getAccount } from "@/lib/youtube";
import { isExhausted, markCall, markFailure } from "@/lib/pipeline/usage";
import { assembleParts, composeFinal, dimsFor, planTimeline, renderSceneSegment, type ComposeScene, type TimelineEntry } from "@/video/composition/compose";
import { ffmpegAvailable, probe } from "@/video/composition/ffmpeg";
import { validateFinal } from "@/video/composition/validate";
import { accessFor, estimateCost, getProvider, videoProviderChain } from "@/video/providers";
import { FREE_UNAVAILABLE_MESSAGE } from "@/video/providers/policy";
import { generateImage, ImageQuotaError } from "@/video/providers/images";
import { stockClipFor, stockConfigured } from "@/video/providers/stock";
import { ProviderError, type VideoProvider } from "@/video/providers/types";
import { ensureScratch, fileExists, materialize, putFile, signedUrl, storageBackend, storageKey, storedLooksPresent } from "@/video/storage";
import { scenePrompt } from "@/video/storyboard";

/**
 * The production pipeline, one small unit of work per call (a story part, one scene image,
 * one AI clip, one segment, one part…). Every result is saved before the next unit starts,
 * so any interruption — a Vercel timeout, a provider running out of free quota, a crash —
 * resumes exactly where it stopped. Nothing is ever regenerated if it already exists.
 *
 * Visuals per scene:  AI image (image-provider chain) → optional AI image-to-video (video-
 * provider chain, free-tier first, paid only if allowed, skipping any out of quota today)
 * → otherwise the AI image is animated with camera motion. Stock footage is an opt-in last
 * resort only when every AI image provider fails.
 */

export type StepOutcome = {
  state: "queued" | "waiting" | "done" | "failed";
  step?: AgentJob["step"];
  delaySeconds?: number;
  progress?: number;
  currentScene?: number | null;
  error?: string | null;
};

const WEIGHTS: Record<AgentJob["step"], [number, number]> = {
  story: [0, 6], voice: [6, 20], clips: [20, 66], audio: [66, 67], segments: [67, 85], parts: [85, 93], compose: [93, 97], validate: [97, 99], publish: [99, 100], done: [100, 100],
};
const progressFor = (step: AgentJob["step"], fraction: number) => {
  const [from, to] = WEIGHTS[step];
  return Math.round(from + (to - from) * Math.max(0, Math.min(1, fraction)));
};
const backoffSeconds = (attempt: number) => Math.min(600, 20 * 2 ** Math.max(0, attempt - 1));
const due = (asset: AssetRow | undefined) => !asset?.next_attempt_at || new Date(asset.next_attempt_at).getTime() <= Date.now();
/** When every free provider is out of quota we wait and resume instead of failing. */
const QUOTA_WAIT = 1800;

type Ctx = { job: AgentJob; videoId: string; story: StoryPlan | null; settings: VideoSettings; config: AgentConfig; row: Record<string, unknown> };
const isLong = (ctx: Ctx) => ctx.settings.format === "long";
const aspectFor = (ctx: Ctx) => aspectOf(ctx.settings);

/* ---------------- story ---------------- */

/** After the script is written: stop for review (Write script first) or go straight on to voice. */
async function afterStory(ctx: Ctx, plan: StoryPlan): Promise<StepOutcome> {
  if (!ctx.settings.pauseAfterStory) return { state: "queued", step: "voice", progress: progressFor("story", 1) };
  await updateVideo(ctx.videoId, { workflow: "draft", error: null });
  await logJob(ctx.job.id, "info", `Script ready: “${plan.title}” — ${plan.scenes.length} scenes. Review or edit it, then press Produce.`);
  return { state: "done", step: "done", progress: progressFor("story", 1), currentScene: null };
}

async function storyStep(ctx: Ctx): Promise<StepOutcome> {
  if (storyComplete(ctx.story)) return afterStory(ctx, ctx.story!);
  const niche = getNiche(String(ctx.row.niche));
  const warnings = Array.isArray(ctx.row.warnings) ? (ctx.row.warnings as string[]) : [];

  const scriptMode = Boolean(ctx.settings.script);
  if (isLong(ctx) || scriptMode) {
    if (!scriptMode && !canWriteLong(niche.id)) return { state: "failed", step: "story", error: `Long videos need a story model. Add a free key (GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY…)${niche.fiction === "never" ? " — factual niches need a keyed model" : ""}.` };
    const tries = await getAssets(ctx.videoId, "story");
    const partIndex = ctx.story?.parts?.find((part) => !part.done)?.index ?? -1;
    const slot = partIndex + 1; // 0 = outline, n = part n-1
    const record = tries.find((asset) => asset.scene_index === slot);
    if (record && !due(record)) return { state: "waiting", step: "story", delaySeconds: Math.max(5, Math.ceil((new Date(record.next_attempt_at!).getTime() - Date.now()) / 1000)) };
    try {
      if (!ctx.story && scriptMode) {
        await logJob(ctx.job.id, "info", "Script mode: reading your script (your words are kept exactly) and planning the visuals…");
        const plan = await outlineFromScript({ niche: niche.id, script: ctx.settings.script!, style: ctx.settings.style, format: ctx.settings.format, timezone: ctx.config.timezone });
        plan.aspect = aspectFor(ctx);
        await updateVideo(ctx.videoId, { story: plan, title: plan.title, hook: plan.hook, sub_niche: plan.subNiche || null });
        await upsertAsset(ctx.videoId, 0, "story", { status: "done", attempts: 0, error: null, next_attempt_at: null });
        await logJob(ctx.job.id, "info", `Storyboard plan ready: “${plan.title}” — ${plan.parts?.length} part(s), ${plan.characters.length} characters (${plan.model ?? "built-in planner"}).`);
        return { state: "queued", step: "story", progress: progressFor("story", 0.15) };
      }
      if (!ctx.story) {
        await logJob(ctx.job.id, "info", `Planning a ${Math.round(ctx.settings.targetDuration / 60)}-minute ${niche.label} video in parts…`);
        const plan = await generateLongOutline({ niche: niche.id, subNiche: (ctx.row.sub_niche as string) ?? undefined, idea: ctx.settings.idea, targetDuration: ctx.settings.targetDuration, style: ctx.settings.style, timezone: ctx.config.timezone, voiceGender: ctx.settings.voiceGender, avoidTitles: await recentTitles(20), aspect: aspectFor(ctx) });
        await updateVideo(ctx.videoId, { story: plan, title: plan.title, hook: plan.hook, sub_niche: plan.subNiche || null });
        await upsertAsset(ctx.videoId, 0, "story", { status: "done", attempts: 0, error: null, next_attempt_at: null });
        await logJob(ctx.job.id, "info", `Outline ready: “${plan.title}” — ${plan.parts?.length} parts, ${plan.characters.length} characters, ${plan.locations?.length ?? 0} locations (${plan.model}).`);
        return { state: "queued", step: "story", progress: progressFor("story", 0.15) };
      }
      const next = scriptMode ? await writeScriptPart(ctx.story, ctx.settings.style) : await generateNextPart(ctx.story, { style: ctx.settings.style });
      const done = next.parts?.filter((part) => part.done).length ?? 0;
      const total = next.parts?.length ?? 1;
      await updateVideo(ctx.videoId, { story: next });
      await upsertAsset(ctx.videoId, slot, "story", { status: "done", attempts: 0, error: null, next_attempt_at: null });
      await logJob(ctx.job.id, "info", `Part ${partIndex + 1}/${total} written (${next.scenes.length} scenes so far).`);
      return storyComplete(next)
        ? afterStory(ctx, next)
        : { state: "queued", step: "story", progress: progressFor("story", 0.15 + 0.85 * (done / total)) };
    } catch (error) {
      // Never restart: keep what's written, retry only this part (the model chain moves on to the next provider).
      const attempts = (record?.attempts ?? 0) + 1;
      const wait = attempts >= ctx.config.maxAttemptsPerScene ? QUOTA_WAIT : backoffSeconds(attempts) * 3;
      const message = error instanceof Error ? error.message : String(error);
      await upsertAsset(ctx.videoId, slot, "story", { status: "failed", attempts: attempts >= ctx.config.maxAttemptsPerScene ? 0 : attempts, error: message, next_attempt_at: new Date(Date.now() + wait * 1000) });
      await logJob(ctx.job.id, "warn", `${slot === 0 ? "Outline" : `Part ${slot}`} not written yet (${message}). Saved progress is kept; retrying in ${Math.round(wait / 60) || 1} min.`);
      return { state: "waiting", step: "story", delaySeconds: wait, error: wait === QUOTA_WAIT ? `${FREE_UNAVAILABLE_MESSAGE} Paused — resumes automatically when a free story model is available.` : null };
    }
  }

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
    aspect: aspectFor(ctx),
  });
  plan.format = "short";
  plan.aspect = aspectFor(ctx);
  await updateVideo(ctx.videoId, { story: plan, title: plan.title, hook: plan.hook, sub_niche: plan.subNiche || null, warnings: note ? [...warnings, note] : warnings });
  await logJob(ctx.job.id, note ? "warn" : "info", note ?? `Story ready: “${plan.title}” — ${plan.scenes.length} scenes (${plan.source === "ai" ? plan.model : "template writer"}).`);
  return afterStory(ctx, plan);
}

/* ---------------- visuals ---------------- */

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
  await markCall(`video-${provider.id}`);
  await upsertAsset(ctx.videoId, index, "clip", { status: "done", mode: "video", provider: provider.id, path: key, provider_ref: null, error: null, attempts, meta: { duration: info.duration, width: info.width, height: info.height, cost } });
  await logJob(ctx.job.id, "info", `Scene ${index + 1}: ${info.duration.toFixed(1)}s AI video from ${provider.label}${cost != null ? ` (~$${cost})` : ""}.`);
}

/** Uses the scene's AI image with camera motion (no extra generation needed). */
async function useImageMotion(ctx: Ctx, index: number, keyframe: AssetRow, reason: string) {
  await upsertAsset(ctx.videoId, index, "clip", { status: "done", mode: "image", provider: keyframe.provider ?? "ai-image", path: keyframe.path, provider_ref: null, error: null, next_attempt_at: null, meta: { from: "keyframe", reason } });
}

async function stockForScene(ctx: Ctx, scene: PlanScene, clips: Map<number, AssetRow>, attempts: number): Promise<StepOutcome> {
  const i = scene.index;
  const avoid = new Set([...clips.values()].map((clip) => String(clip.meta?.stockId ?? "")).filter(Boolean));
  const stock = await stockClipFor(scene, ctx.story!, { seed: i * 31 + ctx.story!.title.length, avoid });
  const file = path.join(await ensureScratch(ctx.videoId), `clip-${i}.mp4`);
  await writeFile(file, stock.bytes);
  const info = await probe(file).catch(() => null);
  if (!info?.hasVideo || info.duration < 0.5) throw new ProviderError("Stock file is not a playable video.", true);
  const key = storageKey.clip(ctx.videoId, i, "mp4");
  await putFile(key, file);
  await upsertAsset(ctx.videoId, i, "clip", { status: "done", mode: "stock", provider: stock.source, path: key, error: null, attempts, next_attempt_at: null, meta: { duration: info.duration, stockId: stock.stockId, credit: stock.credit, pageUrl: stock.pageUrl, query: stock.query } });
  await logJob(ctx.job.id, "warn", `Scene ${i + 1}: every AI image provider failed, used STOCK VIDEO “${stock.query}” (${stock.source}, by ${stock.credit}) — labelled as stock.`);
  return { state: "queued", step: "clips", currentScene: i };
}

function wantsAiVideo(ctx: Ctx, scene: PlanScene) {
  if (ctx.config.aiVideoScenes === "none") return false;
  if (ctx.config.aiVideoScenes === "hook") return scene.index === 0;
  return true;
}

async function clipsStep(ctx: Ctx): Promise<StepOutcome> {
  const story = ctx.story!;
  const total = story.scenes.length;
  const aspect = aspectFor(ctx);
  const chain = videoProviderChain(ctx.settings, ctx.config);
  const clips = new Map((await getAssets(ctx.videoId, "clip")).map((asset) => [asset.scene_index, asset]));
  const keyframes = new Map((await getAssets(ctx.videoId, "keyframe")).map((asset) => [asset.scene_index, asset]));
  const doneCount = story.scenes.filter((scene) => clips.get(scene.index)?.status === "done").length;
  const progress = (extra = 0) => progressFor("clips", (doneCount + extra) / total);
  let earliestRetry: number | null = null;
  const later = (asset: AssetRow) => { const at = new Date(asset.next_attempt_at!).getTime(); earliestRetry = earliestRetry == null ? at : Math.min(earliestRetry, at); };

  for (const scene of story.scenes) {
    const i = scene.index;
    const clip = clips.get(i);
    if (clip?.status === "done" && (await storedLooksPresent(clip.path))) continue;
    const prompts = scenePrompt(story, scene, ctx.settings.style, ctx.settings.audience === "kids", aspect);

    // 0) An AI clip already submitted: poll it (the provider is remembered on the asset).
    if (clip?.status === "running" && clip.provider_ref && clip.provider) {
      const provider = getProvider(clip.provider);
      const keyframe = keyframes.get(i);
      if (!provider?.poll) { if (keyframe?.path) await useImageMotion(ctx, i, keyframe, "provider unavailable"); continue; }
      const access = accessFor(provider, ctx.config);
      if (!access.allowed) {
        // e.g. Free Mode switched on while a paid clip was in flight: never call it again.
        await logJob(ctx.job.id, "warn", `Scene ${i + 1}: ${provider.label} — ${access.reason}. No call made; using the AI image with camera motion.`);
        if (keyframe?.path) await useImageMotion(ctx, i, keyframe, access.reason);
        continue;
      }
      try {
        const poll = await provider.poll(clip.provider_ref, ctx.config);
        if (poll.status === "pending") return { state: "waiting", step: "clips", delaySeconds: 12, currentScene: i, progress: progress() };
        if (poll.status === "done") { await saveClip(ctx, i, provider, poll.result.bytes, poll.result.mimeType, clip.attempts); return { state: "queued", step: "clips", currentScene: i, progress: progress(1) }; }
        await logJob(ctx.job.id, "warn", `Scene ${i + 1}: ${provider.label} failed (${poll.error}). Using the AI image with camera motion.`);
        if (keyframe?.path) await useImageMotion(ctx, i, keyframe, poll.error);
        return { state: "queued", step: "clips", currentScene: i, progress: progress(1) };
      } catch (error) {
        if (keyframe?.path) await useImageMotion(ctx, i, keyframe, error instanceof Error ? error.message : "poll failed");
        return { state: "queued", step: "clips", currentScene: i, progress: progress(1) };
      }
    }
    if (clip && !due(clip)) { later(clip); continue; }

    // 1) The scene's AI image — the base of every scene (and the first frame for image-to-video).
    let keyframe = keyframes.get(i);
    if (!(keyframe?.status === "done" && keyframe.path && (await storedLooksPresent(keyframe.path)))) {
      if (keyframe && !due(keyframe)) { later(keyframe); continue; }
      const attempts = (keyframe?.attempts ?? 0) + 1;
      try {
        await upsertAsset(ctx.videoId, i, "keyframe", { status: "running", mode: "image", attempts });
        const image = await generateImage(prompts.keyframePrompt, prompts.seed + i, ctx.config, aspect);
        const key = storageKey.keyframe(ctx.videoId, i);
        const file = path.join(await ensureScratch(ctx.videoId), `keyframe-${i}.jpg`);
        await writeFile(file, image.bytes);
        await putFile(key, file);
        await upsertAsset(ctx.videoId, i, "keyframe", { status: "done", mode: "image", provider: image.provider, path: key, attempts, error: null, next_attempt_at: null });
        await logJob(ctx.job.id, "info", `Scene ${i + 1}/${total}: AI image ready (${image.provider}).`);
        return { state: "queued", step: "clips", currentScene: i, progress: progress(0.5) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const quota = error instanceof ImageQuotaError;
        if ((quota || attempts >= ctx.config.maxAttemptsPerScene) && ctx.config.allowStockVideo && stockConfigured()) {
          try { return await stockForScene(ctx, scene, clips, attempts); } catch { /* fall through to waiting */ }
        }
        const wait = quota || attempts >= ctx.config.maxAttemptsPerScene ? QUOTA_WAIT : backoffSeconds(attempts);
        await upsertAsset(ctx.videoId, i, "keyframe", { status: "failed", attempts: wait === QUOTA_WAIT ? 0 : attempts, error: message, next_attempt_at: new Date(Date.now() + wait * 1000) });
        await logJob(ctx.job.id, "warn", quota
          ? `Scene ${i + 1}: ${FREE_UNAVAILABLE_MESSAGE} Every free image provider is out of quota right now; everything made so far is saved — resuming automatically in ${Math.round(wait / 60)} min.`
          : `Scene ${i + 1} image attempt ${attempts} failed: ${message}. Retrying in ${wait >= 60 ? `${Math.round(wait / 60)} min` : `${wait}s`}.`);
        return { state: "waiting", step: "clips", delaySeconds: wait, currentScene: i, progress: progress(), error: quota || wait === QUOTA_WAIT ? `${FREE_UNAVAILABLE_MESSAGE} Paused — resumes automatically when free quota returns.` : null };
      }
    }
    keyframe = keyframes.get(i) ?? (await getAssets(ctx.videoId, "keyframe")).find((asset) => asset.scene_index === i);
    if (!keyframe?.path) continue;

    // 2) Optional AI image-to-video, provider by provider, skipping any out of quota today.
    const aiAllowed = chain.length > 0 && wantsAiVideo(ctx, scene) && clip?.mode !== "image";
    let provider: VideoProvider | undefined;
    if (aiAllowed && (await usageToday()).clips < ctx.config.dailyClipLimit) {
      for (const candidate of chain) if (!(await isExhausted(`video-${candidate.id}`))) { provider = candidate; break; }
    }
    if (!provider) {
      await useImageMotion(ctx, i, keyframe, chain.length ? "AI video providers out of quota / daily clip limit" : "no AI video provider");
      continue; // no generation needed — move straight on to the next scene
    }
    const attempts = (clip?.attempts ?? 0) + 1;
    if (!accessFor(provider, ctx.config).allowed) { await useImageMotion(ctx, i, keyframe, "provider not allowed"); continue; }
    try {
      const imageDataUrl = provider.capabilities.imageToVideo ? `data:image/jpeg;base64,${(await readFile(await materialize(keyframe.path, ctx.videoId))).toString("base64")}` : undefined;
      const imageUrl = provider.capabilities.imageToVideo && storageBackend() === "supabase" ? (await signedUrl(keyframe.path, 3600)) ?? undefined : undefined;
      await upsertAsset(ctx.videoId, i, "clip", { status: "running", mode: "video", provider: provider.id, attempts, error: null, next_attempt_at: null });
      await logJob(ctx.job.id, "info", `Scene ${i + 1}/${total}: animating the AI image with ${provider.label} (attempt ${attempts})…`);
      const submission = await provider.submit({
        prompt: prompts.prompt,
        negativePrompt: prompts.negativePrompt,
        durationSec: Math.min(ctx.config.maxClipSeconds, scene.duration > 6 && ctx.settings.quality === "production" ? 10 : 5),
        aspectRatio: aspect,
        seed: prompts.seed,
        imageDataUrl,
        imageUrl,
        quality: ctx.settings.quality,
      }, ctx.config);
      if (submission.status === "pending") {
        await upsertAsset(ctx.videoId, i, "clip", { status: "running", provider: provider.id, provider_ref: submission.ref });
        return { state: "waiting", step: "clips", delaySeconds: 15, currentScene: i, progress: progress(0.5) };
      }
      await saveClip(ctx, i, provider, submission.result.bytes, submission.result.mimeType, attempts);
      return { state: "queued", step: "clips", currentScene: i, progress: progress(1) };
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : undefined;
      const retryable = error instanceof ProviderError ? error.retryable : true;
      const message = error instanceof Error ? error.message : String(error);
      if (status === 401 || status === 402 || status === 403 || status === 429) {
        // Out of credits / quota / key refused → skip this provider for the rest of the day, try the next one.
        await markFailure(`video-${provider.id}`, true);
        await upsertAsset(ctx.videoId, i, "clip", { status: "pending", attempts: 0, error: message, provider_ref: null, next_attempt_at: null });
        await logJob(ctx.job.id, "warn", `Scene ${i + 1}: ${provider.label} is out of quota/credits (${status}) — switching provider.`);
        return { state: "queued", step: "clips", currentScene: i, progress: progress() };
      }
      if (retryable && attempts < ctx.config.maxAttemptsPerScene) {
        const wait = backoffSeconds(attempts);
        await upsertAsset(ctx.videoId, i, "clip", { status: "failed", attempts, error: message, provider_ref: null, next_attempt_at: new Date(Date.now() + wait * 1000) });
        await logJob(ctx.job.id, "warn", `Scene ${i + 1}: ${provider.label} attempt ${attempts} failed (${message}). Retrying in ${wait}s.`);
        return { state: "waiting", step: "clips", delaySeconds: wait, currentScene: i, progress: progress() };
      }
      await markFailure(`video-${provider.id}`);
      await logJob(ctx.job.id, "warn", `Scene ${i + 1}: ${provider.label} failed (${message}). Using the AI image with camera motion.`);
      await useImageMotion(ctx, i, keyframe, message);
      return { state: "queued", step: "clips", currentScene: i, progress: progress(1) };
    }
  }
  if (earliestRetry != null) return { state: "waiting", step: "clips", delaySeconds: Math.max(5, Math.ceil((earliestRetry - Date.now()) / 1000)), progress: progress() };
  return { state: "queued", step: "audio", progress: progressFor("clips", 1), currentScene: null };
}

/* ---------------- editing: timeline, segments, parts, final ---------------- */

async function audioStep(): Promise<StepOutcome> {
  if (!(await ffmpegAvailable())) return { state: "failed", step: "audio", error: "ffmpeg is not available on this server. On Vercel, make sure the ffmpeg-static package is installed; elsewhere install ffmpeg." };
  return { state: "queued", step: "segments", progress: progressFor("audio", 1) };
}

type PlannedScene = ComposeScene & { clipKey: string; clipStamp: string; voiceKey: string | null; clipMode: string | null; clipUploaded: boolean; voiceUploaded: boolean };
type Group = { index: number; scenes: PlannedScene[]; entries: TimelineEntry[]; maxDuration: number };

/**
 * Longest a Short may run. AI narration is nudged to fit the length you picked; a recording YOU
 * uploaded is never sped up — the video simply runs as long as your voice does.
 */
function shortCap(ctx: Ctx, scenes: PlannedScene[]) {
  const base = Math.max(ctx.settings.targetDuration + 10, 20);
  if (!scenes.some((scene) => scene.voiceUploaded)) return base;
  const spoken = scenes.reduce((sum, scene) => sum + (scene.voiceFile ? scene.voiceDuration : scene.plannedDuration) + 1.2, 0);
  return Math.max(base, Math.ceil(spoken + 5));
}

/**
 * Timeline for the whole video. Shorts are one group; long videos get one group per story part
 * (each part is edited and rendered on its own, then the parts are joined).
 */
async function composePlan(ctx: Ctx) {
  const story = ctx.story!;
  const clips = new Map((await getAssets(ctx.videoId, "clip")).map((asset) => [asset.scene_index, asset]));
  const voices = new Map((await getAssets(ctx.videoId, "voice")).map((asset) => [asset.scene_index, asset]));
  const scenes: PlannedScene[] = [];
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
      clipMode: clip.mode,
      clipUploaded: clip.provider === "upload",
      voiceUploaded: voiceOk && voice!.provider === "upload",
    });
  }
  const groups: Group[] = [];
  if (isLong(ctx)) {
    const byPart = new Map<number, PlannedScene[]>();
    story.scenes.forEach((scene, k) => {
      const key = scene.part ?? Math.floor(k / 8);
      byPart.set(key, [...(byPart.get(key) ?? []), scenes[k]]);
    });
    [...byPart.entries()].sort((a, b) => a[0] - b[0]).forEach(([, list], index) => {
      const maxDuration = 60 * 20;
      groups.push({ index, scenes: list, entries: planTimeline(list, maxDuration).entries, maxDuration });
    });
  } else {
    const maxDuration = shortCap(ctx, scenes);
    groups.push({ index: 0, scenes, entries: planTimeline(scenes, maxDuration).entries, maxDuration });
  }
  const lengthOf = new Map<number, number>();
  for (const group of groups) group.scenes.forEach((scene, k) => lengthOf.set(scene.index, group.entries[k].length));
  return { scenes, clips, groups, lengthOf };
}

/** One scene segment per call. Re-renders only when its clip, length, size or look changed. */
async function segmentsStep(ctx: Ctx): Promise<StepOutcome> {
  const plan = await composePlan(ctx);
  if (!plan) return { state: "queued", step: "clips" };
  const niche = getNiche(ctx.story!.niche);
  const dims = dimsFor(aspectFor(ctx));
  const segments = new Map((await getAssets(ctx.videoId, "segment")).map((asset) => [asset.scene_index, asset]));
  const total = plan.scenes.length;
  for (const [i, scene] of plan.scenes.entries()) {
    const length = plan.lengthOf.get(scene.index)!;
    const signature = `${scene.clipStamp}|${length.toFixed(3)}|${niche.colorGrade}|${scene.camera}|${scene.atmosphere.join(",")}|${dims.width}x${dims.height}`;
    const existing = segments.get(scene.index);
    if (existing?.status === "done" && existing.meta?.signature === signature && (await storedLooksPresent(existing.path))) continue;
    await logJob(ctx.job.id, "info", `Editing scene ${i + 1}/${total} (${length.toFixed(1)}s, ${scene.clipUploaded ? (scene.kind === "image" ? `your image + ${scene.camera} motion` : "your clip, fitted to the frame") : scene.kind === "image" ? `AI image + ${scene.camera} motion` : "AI video"})…`);
    const source = await materialize(scene.clipKey, ctx.videoId);
    const out = path.join(await ensureScratch(ctx.videoId), `seg-${scene.index}.mp4`);
    await renderSceneSegment({ ...scene, source }, length, niche.colorGrade, out, dims);
    const key = storageKey.segment(ctx.videoId, scene.index);
    await putFile(key, out);
    await upsertAsset(ctx.videoId, scene.index, "segment", { status: "done", mode: "video", path: key, error: null, meta: { signature, length } });
    return { state: "queued", step: "segments", currentScene: scene.index, progress: progressFor("segments", (i + 1) / total) };
  }
  return { state: "queued", step: isLong(ctx) ? "parts" : "compose", progress: progressFor("segments", 1), currentScene: null };
}

async function renderGroup(ctx: Ctx, group: Group, outFile: string, coverFile: string, partMode: boolean) {
  const story = ctx.story!;
  const niche = getNiche(story.niche);
  const segmentAssets = new Map((await getAssets(ctx.videoId, "segment")).map((asset) => [asset.scene_index, asset]));
  const segments: string[] = [];
  for (const scene of group.scenes) {
    const asset = segmentAssets.get(scene.index);
    if (!asset?.path || asset.status !== "done") return null;
    segments.push(await materialize(asset.path, ctx.videoId));
  }
  const scenes: ComposeScene[] = [];
  for (const scene of group.scenes) scenes.push({ ...scene, voiceFile: scene.voiceKey ? await materialize(scene.voiceKey, ctx.videoId) : null });
  const workDir = path.join(await ensureScratch(ctx.videoId), partMode ? `part-${group.index}` : "final");
  await mkdir(workDir, { recursive: true });
  return composeFinal({
    workDir, scenes, segments,
    grade: niche.colorGrade,
    ambience: ctx.settings.sfx ? niche.ambience : [],
    captions: ctx.settings.captions,
    captionsEnabled: true,
    hookText: group.index === 0 ? story.scenes[0]?.onScreenText || "" : "",
    coverTitle: story.seo.title || story.title,
    musicMood: ctx.settings.music ? story.musicMood : null,
    musicVolume: ctx.settings.musicVolume,
    sfxEnabled: ctx.settings.sfx,
    quality: ctx.settings.quality,
    maxDuration: group.maxDuration,
    outFile, coverFile,
    dims: dimsFor(aspectFor(ctx)),
    partMode,
    onProgress: async (label) => { await extendLease(ctx.job.id, 330); await logJob(ctx.job.id, "info", `${partMode ? `Part ${group.index + 1}: ` : ""}${label}`); },
  });
}

/** Long videos: edit each story part (transitions, captions, voice, SFX) as its own file. */
async function partsStep(ctx: Ctx): Promise<StepOutcome> {
  const plan = await composePlan(ctx);
  if (!plan) return { state: "queued", step: "clips" };
  const parts = new Map((await getAssets(ctx.videoId, "part")).map((asset) => [asset.scene_index, asset]));
  const segmentAssets = new Map((await getAssets(ctx.videoId, "segment")).map((asset) => [asset.scene_index, asset]));
  for (const group of plan.groups) {
    const signature = group.scenes.map((scene) => `${scene.index}:${segmentAssets.get(scene.index)?.meta?.signature ?? ""}:${scene.voiceKey ?? ""}`).join("|");
    const existing = parts.get(group.index);
    if (existing?.status === "done" && existing.meta?.signature === signature && (await storedLooksPresent(existing.path))) continue;
    const scratch = await ensureScratch(ctx.videoId);
    const outFile = path.join(scratch, `part-${group.index}.mp4`);
    const coverFile = group.index === 0 ? path.join(scratch, "cover.jpg") : "";
    const result = await renderGroup(ctx, group, outFile, coverFile, true);
    if (!result) return { state: "queued", step: "segments" };
    await putFile(storageKey.part(ctx.videoId, group.index), outFile);
    if (coverFile && (await fileExists(coverFile))) { await putFile(storageKey.cover(ctx.videoId), coverFile); await updateVideo(ctx.videoId, { cover_path: storageKey.cover(ctx.videoId) }); }
    await upsertAsset(ctx.videoId, group.index, "part", { status: "done", mode: "video", path: storageKey.part(ctx.videoId, group.index), error: null, meta: { signature, duration: result.duration, warnings: result.warnings } });
    await logJob(ctx.job.id, "info", `Part ${group.index + 1}/${plan.groups.length} edited (${result.duration.toFixed(0)}s).`);
    return { state: "queued", step: "parts", progress: progressFor("parts", (group.index + 1) / plan.groups.length) };
  }
  return { state: "queued", step: "compose", progress: progressFor("parts", 1) };
}

/** Final pass. Shorts: full edit in one go. Long: join parts + one music bed + loudness. Then validation. */
async function composeStep(ctx: Ctx): Promise<StepOutcome> {
  const story = ctx.story!;
  const plan = await composePlan(ctx);
  if (!plan) return { state: "queued", step: "clips" };
  const scratch = await ensureScratch(ctx.videoId);
  const outFile = path.join(scratch, "final.mp4");
  const coverFile = path.join(scratch, "cover.jpg");
  const dims = dimsFor(aspectFor(ctx));
  let duration: number;
  let composeWarnings: string[] = [];
  let hasCover = false;

  if (isLong(ctx)) {
    const partAssets = new Map((await getAssets(ctx.videoId, "part")).map((asset) => [asset.scene_index, asset]));
    const files: string[] = [];
    for (const group of plan.groups) {
      const asset = partAssets.get(group.index);
      if (!asset?.path || asset.status !== "done") return { state: "queued", step: "parts" };
      files.push(await materialize(asset.path, ctx.videoId));
      composeWarnings.push(...(Array.isArray(asset.meta?.warnings) ? (asset.meta!.warnings as string[]) : []));
    }
    await logJob(ctx.job.id, "info", `Joining ${files.length} parts, adding the music bed and mastering loudness…`);
    const workDir = path.join(scratch, "final");
    await mkdir(workDir, { recursive: true });
    const result = await assembleParts({ workDir, parts: files, musicMood: ctx.settings.music ? story.musicMood : null, musicVolume: ctx.settings.musicVolume, outFile, onProgress: async (label) => { await extendLease(ctx.job.id, 330); await logJob(ctx.job.id, "info", label); } });
    duration = result.duration;
    hasCover = await storedLooksPresent(storageKey.cover(ctx.videoId));
  } else {
    await logJob(ctx.job.id, "info", "Final edit: transitions, captions, voice, music and SFX…");
    const result = await renderGroup(ctx, plan.groups[0], outFile, coverFile, false);
    if (!result) return { state: "queued", step: "segments" };
    duration = result.duration;
    composeWarnings = result.warnings;
    hasCover = await fileExists(coverFile);
    if (hasCover) await putFile(storageKey.cover(ctx.videoId), coverFile);
  }

  const anyUploadedVoice = plan.scenes.some((scene) => scene.voiceUploaded);
  const maxDuration = isLong(ctx) ? (anyUploadedVoice ? Math.max(ctx.settings.targetDuration * 1.6 + 60, duration + 5) : ctx.settings.targetDuration * 1.6 + 60) : Math.max(ctx.settings.targetDuration + 10, plan.groups[0].maxDuration);
  const report = await validateFinal(outFile, { maxDuration, expectAudio: plan.scenes.some((scene) => scene.voiceKey), dims, format: ctx.settings.format });
  if (!report.ok) return { state: "failed", step: "compose", error: `Validation failed: ${report.errors.join(" ")}` };
  await putFile(storageKey.final(ctx.videoId), outFile);

  // Honest labels: files you uploaded are never counted as AI-generated.
  const modes = new Set(plan.scenes.map((scene) => (scene.clipUploaded ? "upload" : scene.clipMode === "stock" ? "stock" : scene.clipMode === "image" ? "image" : "video")));
  const renderMode = modes.size > 1 ? "mixed" : modes.has("upload") ? "upload" : modes.has("image") ? "image" : modes.has("stock") ? "stock" : "video";
  const uploadedClips = plan.scenes.filter((scene) => scene.clipUploaded).length;
  const uploadedVoices = plan.scenes.filter((scene) => scene.voiceUploaded).length;
  const stockCredits = Array.from(new Set([...plan.clips.values()].filter((clip) => clip.mode === "stock").map((clip) => `${clip.meta?.credit ?? "unknown"} (${clip.provider === "pixabay" ? "Pixabay" : "Pexels"})`)));
  const prior = (Array.isArray(ctx.row.warnings) ? (ctx.row.warnings as string[]) : []).filter((w) => !/^Narration sped up|No synthesized sound|Final length|Cover image failed|IMAGE MODE|AI IMAGES|STOCK VIDEO|YOUR MEDIA|YOUR VOICE|Duration .* above|No narration/.test(w));
  const costs = [...plan.clips.values()].map((clip) => Number(clip.meta?.cost)).filter((n) => Number.isFinite(n));
  const imageScenes = plan.scenes.filter((scene) => scene.clipMode === "image" && !scene.clipUploaded).length;
  await updateVideo(ctx.videoId, {
    final_path: storageKey.final(ctx.videoId),
    cover_path: hasCover ? storageKey.cover(ctx.videoId) : null,
    duration_sec: Math.round(duration * 10) / 10,
    render_mode: renderMode,
    warnings: Array.from(new Set([
      ...prior, ...composeWarnings, ...report.warnings,
      ...(imageScenes ? [`AI IMAGES + MOTION: ${imageScenes}/${plan.scenes.length} scenes are AI-generated images animated with camera motion (not AI video clips).`] : []),
      ...(modes.has("stock") ? [`STOCK VIDEO: some scenes are free stock footage, not AI. Credits: ${stockCredits.join(", ")}.`] : []),
      ...(uploadedClips ? [`YOUR MEDIA: ${uploadedClips}/${plan.scenes.length} scenes use clips or images you uploaded (not AI-generated).`] : []),
      ...(uploadedVoices ? [`YOUR VOICE: ${uploadedVoices}/${plan.scenes.length} scenes use narration you recorded.`] : []),
    ])).slice(0, 20),
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
  if (job.step !== "story" && !storyComplete(ctx.story)) return { state: "queued", step: "story" };
  switch (job.step) {
    case "story": return storyStep(ctx);
    case "voice": return generateVoiceStep(ctx.job, ctx.videoId, ctx.story!, settings, config, progressFor);
    case "clips": return clipsStep(ctx);
    case "audio": return audioStep();
    case "segments": return segmentsStep(ctx);
    case "parts": return partsStep(ctx);
    case "compose": return composeStep(ctx);
    case "validate": return validateStep(ctx);
    case "publish": return publishStep(ctx);
    default: return { state: "done", step: "done", progress: 100 };
  }
}
