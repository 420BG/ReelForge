import type { EditorSettings, StoryScene, StudioProject } from "@/lib/types";
import { DEFAULT_EDITOR_SETTINGS, POLLINATIONS_VOICES } from "@/lib/types";

export const MAX_SHORT_SECONDS = 60;

export function sceneDefaults(index: number): Pick<StoryScene, "motion" | "camera" | "transition" | "expression" | "showCharacter"> {
  const motions: NonNullable<StoryScene["motion"]>[] = ["bounce", "walk", "wave", "dance", "float"];
  const cameras: NonNullable<StoryScene["camera"]>[] = ["push-in", "pan-left", "steady", "pan-right", "push-in"];
  const expressions: NonNullable<StoryScene["expression"]>[] = ["curious", "happy", "excited", "happy", "happy"];
  return {
    motion: motions[index % motions.length],
    camera: cameras[index % cameras.length],
    transition: index === 0 ? "fade" : index % 3 === 0 ? "pop" : index % 2 === 0 ? "fade" : "slide",
    expression: expressions[index % expressions.length],
    showCharacter: true,
  };
}

export function getSceneDuration(project: Pick<StudioProject, "duration" | "scenes">, scene: StoryScene) {
  const fallback = project.duration / Math.max(1, project.scenes.length);
  const value = Number(scene.duration);
  return Number.isFinite(value) && value >= 2 && value <= 20 ? value : Math.max(2, fallback);
}

export function getTimeline(project: Pick<StudioProject, "duration" | "scenes">) {
  let start = 0;
  return project.scenes.map((scene, index) => {
    const duration = getSceneDuration(project, scene);
    const clip = { index, start, end: start + duration, duration };
    start += duration;
    return clip;
  });
}

export function getTotalDuration(project: Pick<StudioProject, "duration" | "scenes">) {
  const timeline = getTimeline(project);
  return timeline.length ? timeline[timeline.length - 1].end : 0;
}

export function resolvePlayhead(project: Pick<StudioProject, "duration" | "scenes">, time: number) {
  const timeline = getTimeline(project);
  const total = timeline.length ? timeline[timeline.length - 1].end : 0;
  const elapsed = Math.max(0, Math.min(time, Math.max(0, total - .0001)));
  const clip = timeline.find((item) => elapsed < item.end) ?? timeline[timeline.length - 1];
  if (!clip) return { index: 0, local: 0, duration: 0, total: 0, clip: null };
  return { index: clip.index, local: elapsed - clip.start, duration: clip.duration, total, clip };
}

export function getEditorSettings(project: Pick<StudioProject, "editSettings">): EditorSettings {
  return { ...DEFAULT_EDITOR_SETTINGS, ...(project.editSettings || {}) };
}

export function normalizeEditorSettings(input: unknown): EditorSettings {
  const value = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
  const captionStyles = ["storybook", "comic", "subtitles"];
  const musicPresets = ["playful", "dreamy", "adventure", "off"];
  const provider = value.voiceProvider === "elevenlabs" ? "elevenlabs" : "pollinations";
  const polliVoices: string[] = POLLINATIONS_VOICES.map((voice) => voice.id);
  const voiceId = typeof value.voiceId === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value.voiceId) ? value.voiceId : DEFAULT_EDITOR_SETTINGS.voiceId;
  return {
    captionStyle: captionStyles.includes(value.captionStyle as string) ? value.captionStyle as EditorSettings["captionStyle"] : "storybook",
    music: musicPresets.includes(value.music as string) ? value.music as EditorSettings["music"] : "playful",
    musicVolume: Math.round(Math.max(0, Math.min(100, Number.isFinite(Number(value.musicVolume)) && value.musicVolume != null ? Number(value.musicVolume) : DEFAULT_EDITOR_SETTINGS.musicVolume))),
    voiceVolume: Math.round(Math.max(0, Math.min(100, Number.isFinite(Number(value.voiceVolume)) && value.voiceVolume != null ? Number(value.voiceVolume) : DEFAULT_EDITOR_SETTINGS.voiceVolume))),
    voiceProvider: provider,
    voiceId: provider === "pollinations" ? (polliVoices.includes(voiceId) ? voiceId : DEFAULT_EDITOR_SETTINGS.voiceId) : voiceId,
  };
}
