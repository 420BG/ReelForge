import { db } from "@/db";
import { projects } from "@/db/schema";
import { assembleDailyProject } from "@/lib/automation";
import { getDailyTopic, mediaToProxyUrl } from "@/lib/discovery";
import { getAutoSettings, saveAutoSettings } from "@/lib/keys";
import { serializeProject } from "@/lib/projects";
import { searchStock } from "@/lib/stock";
import { categoryThumbnail, createAiStory } from "@/lib/story";
import { hasRender } from "@/lib/storage";
import type { MediaAsset, StudioProject } from "@/lib/types";
import { desc, sql } from "drizzle-orm";

export type PendingRender = { id: string; title: string; hasRender: boolean };

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function runAutopilotIfDue(): Promise<{ ran: boolean; project?: StudioProject; reason?: string }> {
  const auto = await getAutoSettings();
  if (!auto.enabled) return { ran: false, reason: "disabled" };
  if (auto.lastRunDate === today()) return { ran: false, reason: "already-ran-today" };

  const topic = getDailyTopic();
  let story;
  if (process.env.OPENROUTER_API_KEY) {
    try {
      story = await createAiStory({ idea: `${topic.title}: ${topic.lesson}`, category: topic.category, ageGroup: "3–5 years", duration: 45, style: "Storybook", character: "fox" });
    } catch {
      story = undefined;
    }
  }

  let assets: MediaAsset[] = [];
  if (process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY) {
    const source = process.env.PEXELS_API_KEY ? "pexels" as const : "pixabay" as const;
    try {
      const result = await searchStock(source, topic.query);
      assets = result.assets.slice(0, 5).map((asset) => ({
        ...asset,
        downloadUrl: mediaToProxyUrl(asset.downloadUrl),
        posterUrl: asset.posterUrl ? mediaToProxyUrl(asset.posterUrl) : undefined,
      }));
    } catch {
      assets = [];
    }
  }

  const assembled = assembleDailyProject(assets, {
    title: story?.title || topic.title,
    idea: `${topic.title}: a gentle preschool story about ${topic.lesson}.`,
    category: topic.category,
    ageGroup: "3–5 years",
    duration: 42,
    character: "fox",
    story,
  });
  if (story) {
    assembled.youtubeTitle = story.youtubeTitle;
    assembled.description = story.description;
    assembled.tags = Array.from(new Set([...assembled.tags, ...story.tags])).slice(0, 12);
  }
  if (!assembled.thumbnail) assembled.thumbnail = categoryThumbnail(topic.category);

  const [row] = await db.insert(projects).values({
    title: assembled.title,
    idea: assembled.idea,
    category: assembled.category,
    ageGroup: assembled.ageGroup,
    duration: assembled.duration,
    style: assembled.style,
    character: assembled.character,
    scenes: assembled.scenes,
    editSettings: { captionStyle: "storybook", music: "playful", musicVolume: 28, voiceVolume: 90, voiceProvider: "pollinations", voiceId: "af_heart" },
    status: "draft",
    thumbnail: assembled.thumbnail,
    youtubeTitle: assembled.youtubeTitle,
    description: assembled.description,
    tags: [...assembled.tags, "autopilot"],
    privacy: auto.visibility,
  }).returning();
  await saveAutoSettings({ lastRunDate: today() });
  return { ran: true, project: serializeProject(row) };
}

export async function listPendingRenders(): Promise<PendingRender[]> {
  const rows = await db.select().from(projects)
    .where(sql`${projects.tags} @> '["autopilot"]'::jsonb`)
    .orderBy(desc(projects.createdAt))
    .limit(10);
  const pending: PendingRender[] = [];
  for (const row of rows) {
    if (row.status === "published" || row.youtubeVideoId) continue;
    pending.push({ id: row.id, title: row.title, hasRender: await hasRender(row.id) });
  }
  return pending;
}
