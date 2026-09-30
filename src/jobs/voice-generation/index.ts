import { getNiche } from "@/content/niches/registry";
import type { AgentConfig, AgentJob, StoryPlan, VideoSettings } from "@/content/types";
import { getAssets, logJob, updateVideo, upsertAsset, getVideoRow } from "@/jobs/repo";
import { planVoice, synthesizeNarration } from "@/video/audio/voice";
import { ProviderError } from "@/video/providers/types";
import path from "node:path";
import { ensureScratch, putFile, storageKey, storedLooksPresent } from "@/video/storage";
import type { StepOutcome } from "@/jobs/video-generation/pipeline";

const backoff = (attempt: number) => Math.min(300, 15 * 2 ** Math.max(0, attempt - 1));

/** One narration clip per call; already-finished scenes are never regenerated. */
export async function generateVoiceStep(job: AgentJob, videoId: string, story: StoryPlan, settings: VideoSettings, config: AgentConfig, progressFor: (step: AgentJob["step"], fraction: number) => number): Promise<StepOutcome> {
  const niche = getNiche(story.niche);
  const plan = await planVoice(settings, niche).catch(() => null);
  const voices = new Map((await getAssets(videoId, "voice")).map((asset) => [asset.scene_index, asset]));
  if (!plan) {
    for (const scene of story.scenes) if (voices.get(scene.index)?.status !== "done") await upsertAsset(videoId, scene.index, "voice", { status: "skipped", mode: "audio", error: null });
    const row = await getVideoRow(videoId);
    const warnings = Array.isArray(row?.warnings) ? (row!.warnings as string[]) : [];
    const note = settings.voiceProvider === "none" ? "Narration turned off: captions and music only." : "No voice provider configured (POLLINATIONS_API_KEY or ELEVENLABS_API_KEY): captions and music only.";
    await updateVideo(videoId, { warnings: Array.from(new Set([...warnings, note])) });
    await logJob(job.id, "warn", note);
    return { state: "queued", step: "clips", progress: progressFor("voice", 1) };
  }
  const total = story.scenes.length;
  let done = 0;
  let earliest: number | null = null;
  for (const scene of story.scenes) {
    const asset = voices.get(scene.index);
    if (asset?.status === "done" && (await storedLooksPresent(asset.path))) { done++; continue; }
    if (!scene.narration.trim()) { await upsertAsset(videoId, scene.index, "voice", { status: "skipped", mode: "audio" }); done++; continue; }
    if (asset?.status === "failed" && asset.attempts >= config.maxAttemptsPerScene) {
      return { state: "failed", step: "voice", currentScene: scene.index, error: `Narration for scene ${scene.index + 1} failed after ${asset.attempts} attempt(s): ${asset.error ?? "unknown"}` };
    }
    if (asset?.next_attempt_at && new Date(asset.next_attempt_at).getTime() > Date.now()) {
      earliest = Math.min(earliest ?? Infinity, new Date(asset.next_attempt_at).getTime());
      continue;
    }
    const attempts = (asset?.attempts ?? 0) + 1;
    try {
      const scratch = await ensureScratch(videoId);
      const out = path.join(scratch, `voice-${scene.index}.mp3`);
      const result = await synthesizeNarration(plan, scene.narration, out, path.join(scratch, `raw-voice-${scene.index}.mp3`));
      const key = storageKey.voice(videoId, scene.index);
      await putFile(key, out);
      await upsertAsset(videoId, scene.index, "voice", { status: "done", mode: "audio", provider: plan.provider, path: key, attempts, error: null, next_attempt_at: null, meta: { duration: result.duration, voiceId: result.voiceId, text: scene.narration.slice(0, 200) } });
      await logJob(job.id, "info", `Scene ${scene.index + 1}: narration ${result.duration.toFixed(1)}s (${plan.provider}/${result.voiceId}).`);
      return { state: "queued", step: "voice", currentScene: scene.index, progress: progressFor("voice", (done + 1) / total) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof ProviderError ? error.retryable : true;
      if (retryable && attempts < config.maxAttemptsPerScene) {
        const wait = backoff(attempts);
        await upsertAsset(videoId, scene.index, "voice", { status: "failed", mode: "audio", attempts, error: message, next_attempt_at: new Date(Date.now() + wait * 1000) });
        await logJob(job.id, "warn", `Scene ${scene.index + 1} narration attempt ${attempts} failed: ${message}. Retrying in ${wait}s.`);
        return { state: "waiting", step: "voice", delaySeconds: wait, currentScene: scene.index };
      }
      await upsertAsset(videoId, scene.index, "voice", { status: "failed", mode: "audio", attempts, error: message, next_attempt_at: null });
      return { state: "failed", step: "voice", currentScene: scene.index, error: `Narration for scene ${scene.index + 1} failed: ${message}` };
    }
  }
  if (earliest != null) return { state: "waiting", step: "voice", delaySeconds: Math.max(5, Math.ceil((earliest - Date.now()) / 1000)) };
  return { state: "queued", step: "clips", progress: progressFor("voice", 1), currentScene: null };
}
