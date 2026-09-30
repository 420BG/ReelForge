import { getDailyTopic } from "@/lib/discovery";
import { sceneDefaults } from "@/lib/timeline";
import type { Character, MediaAsset, StudioProject } from "@/lib/types";

import { createOfflineStory, type GeneratedStory, type StoryInput } from "@/lib/story";

type DailyInput = {
  title?: string;
  idea?: string;
  category?: string;
  ageGroup?: string;
  duration?: number;
  character?: Character;
  story?: GeneratedStory;
};

const clean = (value: unknown, max: number, fallback: string) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
const number = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function assembleDailyProject(assets: MediaAsset[], input: DailyInput = {}): StudioProject {
  const topic = getDailyTopic();
  const title = clean(input.title, 100, topic.title);
  const idea = clean(input.idea, 350, topic.title);
  const category = clean(input.category, 50, topic.category);
  const ageGroup = clean(input.ageGroup, 30, "3–5 years");
  const character: Character = input.character || "fox";
  const storyInput: StoryInput = { idea, category, ageGroup, duration: 45, style: "Storybook", character };
  const story = input.story ?? createOfflineStory(storyInput);
  const usableAssets = assets.filter((asset) => asset.downloadUrl).slice(0, 5);
  const count = Math.max(3, Math.min(5, usableAssets.length || 4));
  const total = Math.max(20, Math.min(55, number(input.duration, 42)));
  const clipDuration = Math.max(4, Math.min(20, Math.round((total / count) * 2) / 2));
  const palettes = ["meadow", "forest", "ocean", "sunset", "candy"] as const;
  const scenes = Array.from({ length: count }, (_, index) => {
    const fallback = story.scenes[Math.min(index, story.scenes.length - 1)];
    const asset = usableAssets[index];
    return {
      ...fallback,
      ...sceneDefaults(index),
      duration: clipDuration,
      palette: palettes[index % palettes.length],
      prop: "none" as const,
      showCharacter: !asset,
      artUrl: asset?.posterUrl || fallback.artUrl,
      videoUrl: asset?.downloadUrl,
      videoPosterUrl: asset?.posterUrl,
      sourceName: asset?.source,
      sourceUrl: asset?.pageUrl,
      sourceCredit: asset ? `${asset.author} on ${asset.source}` : undefined,
      visualPrompt: asset ? `Royalty-free clip: ${asset.tags.join(", ")}. ${asset.licenseNote}` : fallback.visualPrompt,
    };
  });
  const credits = assets.map((asset) => `Clip: ${asset.author} / ${asset.source} — ${asset.pageUrl}`).join("\n");
  return {
    id: "",
    title,
    idea,
    category,
    ageGroup,
    duration: Math.round(clipDuration * count),
    style: usableAssets.length ? "Auto daily mix" : "Storybook",
    character,
    scenes,
    status: "draft",
    thumbnail: assets[0]?.posterUrl || null,
    youtubeTitle: `${title.slice(0, 74)} | Gentle Kids Short #Shorts`,
    description: `${story.description}\n\nMusic and captions prepared in Littleloop Studio.\n${credits}`,
    tags: Array.from(new Set(["kids cartoon", "shorts for kids", category.toLowerCase(), "gentle learning", ...assets.flatMap((asset) => asset.tags.slice(0, 2))])).slice(0, 12),
    privacy: "private",
    youtubeVideoId: null,
    createdAt: "",
    updatedAt: "",
  };
}
