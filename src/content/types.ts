/**
 * Shared types for the faceless Shorts agent.
 * Pure types only — safe to import from client components.
 */

export type Audience = "general" | "kids";
export type Workflow = "draft" | "processing" | "review" | "approved" | "published" | "failed";
/** "stock" = free real stock footage (Pexels/Pixabay), NOT AI-generated video. */
export type RenderMode = "video" | "image" | "stock" | "mixed";

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
  /** Long videos: which part this scene belongs to, and which recurring location it is set in. */
  part?: number;
  location?: string;
};

export type VideoFormat = "short" | "long";

/** A recurring place, described once and repeated in every prompt that uses it (visual consistency). */
export type LocationProfile = { id: string; name: string; description: string };

/** Long videos are written part by part so an interrupted generation resumes at the next part. */
export type StoryPart = { index: number; title: string; summary: string; targetSeconds: number; done: boolean; /** Script mode: the user's own words for this part. */ script?: string };

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
  format?: VideoFormat;
  /** Frame shape the images were designed for (unset on older plans: Long = 16:9, else 9:16). */
  aspect?: Aspect;
  /** Shared look for every image in this story (style, palette, lighting). */
  visualBible?: string;
  locations?: LocationProfile[];
  parts?: StoryPart[];
  /** True when the narration is the user's own script (never rewritten). */
  userScript?: boolean;
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
  /** "short" = 9:16 up to 60 s; "long" = 16:9, several minutes, written in parts. */
  format: VideoFormat;
  targetDuration: number;
  style: VisualStyle;
  voiceGender: "female" | "male" | "auto";
  voiceProvider: "auto" | "free" | "deepgram" | "pollinations" | "elevenlabs" | "none";
  voiceId?: string;
  quality: "draft" | "production";
  provider: "auto" | "pollinations" | "fal" | "replicate" | "luma" | "runway";
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
  /** SCRIPT MODE: the user's narration, used word for word (the AI only designs the visuals). */
  script?: string;
  /** Frame shape, chosen independently of length. Unset = Short 9:16, Long 16:9 (older videos). */
  aspect?: Aspect;
  /** Write the script/storyboard, then stop so you can review it before anything is generated. */
  pauseAfterStory?: boolean;
};

export type Aspect = "9:16" | "16:9";
/** The frame shape of a video: its own setting if set, otherwise Short = 9:16, Long = 16:9. */
export function aspectOf(settings: Pick<VideoSettings, "format" | "aspect"> | null | undefined): Aspect {
  if (settings?.aspect === "9:16" || settings?.aspect === "16:9") return settings.aspect;
  return settings?.format === "long" ? "16:9" : "9:16";
}
/** True only for vertical videos up to 3 minutes — what YouTube treats as a Short. */
export function isYouTubeShort(settings: Pick<VideoSettings, "format" | "aspect" | "targetDuration"> | null | undefined, seconds?: number | null) {
  return aspectOf(settings) === "9:16" && (seconds ?? settings?.targetDuration ?? 0) <= 180;
}

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
  format: "short",
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

export type ProviderId = "pollinations" | "fal" | "replicate" | "luma" | "runway";
export type ProviderTier = "free" | "free-tier" | "paid";
export const PAID_PROVIDER_IDS: ProviderId[] = ["fal", "replicate", "luma", "runway"];

/** One-click daily production: a Short and/or a Long each day at local times (AgentConfig.timezone). */
export type DailySchedule = { short: boolean; long: boolean; shortTime: string; longTime: string; niche: string; longMinutes: number };

export type AgentConfig = {
  maxVideosPerBatch: number;
  maxScenesPerVideo: number;
  maxAttemptsPerScene: number;
  maxClipSeconds: number;
  dailyClipLimit: number;
  /** Master switch. Per-video autoPublish is ignored while this is false. */
  autoPublishEnabled: boolean;
  allowImageMode: boolean;
  /** STOCK VIDEO (Pexels/Pixabay) only as a last resort when every AI image provider fails. Off by default. */
  allowStockVideo: boolean;
  /**
   * FREE MODE (default ON): ReelForge never calls a paid provider. A paid provider is usable only when
   * freeMode === false AND providers[id].enabled === true. Enforced server-side in video/providers/policy.ts.
   */
  freeMode: boolean;
  /** Per-provider switches. Paid providers default to disabled; Pollinations (free tier) defaults to enabled. */
  providers: Record<ProviderId, { enabled: boolean }>;
  /** @deprecated replaced by freeMode + providers[id].enabled (kept so old saved settings still load). */
  allowPaidVideo: boolean;
  /** Which scenes may use AI image-to-video (the rest animate the AI image with camera motion). */
  aiVideoScenes: "all" | "hook" | "none";
  daily: DailySchedule;
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
  allowStockVideo: false,
  freeMode: true,
  providers: { pollinations: { enabled: true }, fal: { enabled: false }, replicate: { enabled: false }, luma: { enabled: false }, runway: { enabled: false } },
  allowPaidVideo: false,
  aiVideoScenes: "all",
  daily: { short: false, long: false, shortTime: "09:00", longTime: "17:00", niche: "auto", longMinutes: 5 },
  defaultProvider: "auto",
  models: {
    pollinations: { video: "", image: "flux" },
    fal: { textToVideo: "fal-ai/ltx-video", imageToVideo: "fal-ai/ltx-video/image-to-video", extraInput: {} },
    replicate: { textToVideo: "minimax/video-01", imageToVideo: "minimax/video-01", extraInput: {} },
  },
  pricePerSecond: { pollinations: null, fal: null, replicate: null, luma: null, runway: null },
  timezone: "Asia/Kathmandu",
};

export type SceneAssetStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type SceneAsset = {
  sceneIndex: number;
  kind: "clip" | "voice" | "keyframe" | "segment" | "part";
  status: SceneAssetStatus;
  mode: "video" | "image" | "stock" | "audio" | null;
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
  step: "story" | "voice" | "clips" | "audio" | "segments" | "parts" | "compose" | "validate" | "publish" | "done";
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
