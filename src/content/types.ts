/**
 * Shared types for the faceless Shorts agent.
 * Pure types only — safe to import from client components.
 */

export type Audience = "general" | "kids";
export type Workflow = "draft" | "processing" | "review" | "approved" | "published" | "failed";
export type RenderMode = "video" | "image" | "mixed";

export type SceneBeat = "hook" | "setup" | "escalation" | "twist" | "payoff" | "ending" | "loop";
export type CameraMove =
  | "static" | "slow-push-in" | "pull-out" | "pan-left" | "pan-right" | "tilt-up" | "tilt-down"
  | "tracking" | "dolly-zoom" | "orbit" | "handheld" | "crane-up";
export type AtmosphereFx = "rain" | "fog" | "smoke" | "fire" | "lightning" | "snow" | "dust" | "particles" | "flicker" | "shadows";
export type TransitionKind = "cut" | "fade" | "fadeblack" | "dissolve" | "slideleft" | "slideup" | "circleopen" | "wipeleft" | "zoomin";
export type MusicMood = "suspense" | "dark-ambient" | "romantic" | "emotional" | "uplifting" | "epic" | "curious" | "mysterious" | "playful" | "calm";
export type VoiceStyle = "storytelling" | "horror" | "calm" | "excited" | "documentary" | "warm";
export type VisualStyle = "cinematic" | "dark-cinematic" | "animation-3d" | "anime" | "realistic" | "storybook";
export type CaptionAnimation = "pop" | "karaoke" | "fade" | "none";
export type CaptionPosition = "bottom" | "center" | "top";

export type CharacterProfile = {
  id: string;
  name: string;
  ageRange: string;
  appearance: string;
  clothing: string;
  hair: string;
  face: string;
  personality: string;
  voice: string;
  visualStyle: string;
  /** Fixed seed reused for every keyframe of this character (consistency where the provider supports seeds). */
  referenceSeed: number;
};

export type DialogueLine = { speaker: string; line: string };

export type PlanScene = {
  index: number;
  beat: SceneBeat;
  /** Planned seconds. The composer may stretch it to fit the real narration length. */
  duration: number;
  narration: string;
  dialogue: DialogueLine[];
  /** What the viewer sees: setting + subject + action, self-contained. */
  visual: string;
  /** Character ids present in the shot. */
  characters: string[];
  /** Movement inside the shot: character motion, environment motion, expressions. */
  animation: string;
  camera: CameraMove;
  cameraNote: string;
  atmosphere: AtmosphereFx[];
  sfx: string[];
  musicCue: string;
  caption: string;
  transition: TransitionKind;
  onScreenText?: string;
};

export type SeoPack = {
  title: string;
  description: string;
  hashtags: string[];
  tags: string[];
  categoryId: string;
  /** Local "HH:mm" suggestion plus weekday hint, in the owner's timezone. */
  suggestedPublishTime: string;
};

export type StoryPlan = {
  version: 1;
  niche: string;
  subNiche: string;
  title: string;
  hook: string;
  concept: string;
  curiosityGap: string;
  characters: CharacterProfile[];
  setting: string;
  scenes: PlanScene[];
  ending: string;
  loopLine?: string;
  musicMood: MusicMood;
  tone: string;
  isFiction: boolean;
  seo: SeoPack;
  /** "ai" = written by a language model; "template" = built-in fallback writer (clearly labelled in the UI). */
  source: "ai" | "template";
  model?: string;
};

export type CaptionSettings = {
  font: string;
  size: number;
  position: CaptionPosition;
  animation: CaptionAnimation;
  color: string;
  highlight: string;
  hookTitle: boolean;
};

export type VideoSettings = {
  targetDuration: number;
  style: VisualStyle;
  voiceGender: "female" | "male" | "auto";
  voiceProvider: "auto" | "free" | "pollinations" | "elevenlabs" | "none";
  voiceId?: string;
  quality: "draft" | "production";
  provider: "auto" | "pollinations" | "fal" | "replicate";
  allowImageMode: boolean;
  consistency: boolean;
  captions: CaptionSettings;
  music: boolean;
  sfx: boolean;
  musicVolume: number;
  audience: Audience;
  autoPublish: boolean;
  privacy: "private" | "unlisted" | "public";
  /** Free-text idea from the user; empty means "let the AI pick". */
  idea?: string;
};

export const DEFAULT_CAPTIONS: CaptionSettings = {
  font: "auto",
  size: 96,
  position: "bottom",
  animation: "pop",
  color: "#FFFFFF",
  highlight: "#B7F34A",
  hookTitle: true,
};

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  targetDuration: 30,
  style: "cinematic",
  voiceGender: "auto",
  voiceProvider: "auto",
  quality: "production",
  provider: "auto",
  allowImageMode: false,
  consistency: true,
  captions: DEFAULT_CAPTIONS,
  music: true,
  sfx: true,
  musicVolume: 35,
  audience: "general",
  autoPublish: false,
  privacy: "private",
};

export type ProviderId = "pollinations" | "fal" | "replicate";

export type AgentConfig = {
  maxVideosPerBatch: number;
  maxScenesPerVideo: number;
  maxAttemptsPerScene: number;
  maxClipSeconds: number;
  dailyClipLimit: number;
  /** Master switch. Per-video autoPublish is ignored while this is false. */
  autoPublishEnabled: boolean;
  allowImageMode: boolean;
  defaultProvider: VideoSettings["provider"];
  models: {
    pollinations: { video: string; image: string };
    fal: { textToVideo: string; imageToVideo: string; extraInput: Record<string, unknown> };
    replicate: { textToVideo: string; imageToVideo: string; extraInput: Record<string, unknown> };
  };
  /** USD per generated second, where you know your plan's price. null = unknown (no estimate shown). */
  pricePerSecond: Record<ProviderId, number | null>;
  timezone: string;
};

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxVideosPerBatch: 10,
  maxScenesPerVideo: 8,
  maxAttemptsPerScene: 3,
  maxClipSeconds: 5,
  dailyClipLimit: 40,
  autoPublishEnabled: false,
  allowImageMode: false,
  defaultProvider: "auto",
  models: {
    pollinations: { video: "", image: "flux" },
    fal: { textToVideo: "fal-ai/ltx-video", imageToVideo: "fal-ai/ltx-video/image-to-video", extraInput: {} },
    replicate: { textToVideo: "minimax/video-01", imageToVideo: "minimax/video-01", extraInput: {} },
  },
  pricePerSecond: { pollinations: null, fal: null, replicate: null },
  timezone: "Asia/Kathmandu",
};

export type SceneAssetStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type SceneAsset = {
  sceneIndex: number;
  kind: "clip" | "voice" | "keyframe" | "segment";
  status: SceneAssetStatus;
  mode: "video" | "image" | "audio" | null;
  provider: string | null;
  attempts: number;
  error: string | null;
  updatedAt: string;
  meta: Record<string, unknown>;
};

export type AgentJob = {
  id: string;
  videoId: string;
  state: "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";
  step: "story" | "voice" | "clips" | "audio" | "segments" | "compose" | "validate" | "publish" | "done";
  progress: number;
  currentScene: number | null;
  attempts: number;
  error: string | null;
  log: { at: string; level: "info" | "warn" | "error"; message: string }[];
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentVideo = {
  id: string;
  niche: string;
  subNiche: string | null;
  title: string;
  hook: string | null;
  story: StoryPlan | null;
  settings: VideoSettings;
  audience: Audience;
  workflow: Workflow;
  renderMode: RenderMode | null;
  provider: string | null;
  hasFinal: boolean;
  hasCover: boolean;
  durationSec: number | null;
  youtubeVideoId: string | null;
  privacy: "private" | "unlisted" | "public";
  batchId: string | null;
  error: string | null;
  warnings: string[];
  costEstimate: number | null;
  createdAt: string;
  updatedAt: string;
  job?: AgentJob | null;
  assets?: SceneAsset[];
};
