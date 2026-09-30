import { db } from "@/db";
import { projects } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { assembleDailyProject } from "@/lib/automation";
import { AI_VIDEO_PROVIDERS, getDailyTopic, mediaToProxyUrl } from "@/lib/discovery";
import { serializeProject } from "@/lib/projects";
import { searchStock } from "@/lib/stock";
import type { MediaAsset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown, max: number, fallback = "") => typeof value === "string" ? value.trim().slice(0, max) : fallback;
const number = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function proxied(asset: MediaAsset): MediaAsset {
  return { ...asset, downloadUrl: mediaToProxyUrl(asset.downloadUrl), posterUrl: asset.posterUrl ? mediaToProxyUrl(asset.posterUrl) : undefined };
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio first." }, { status: 401 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "daily";

  if (kind === "providers") return Response.json({ providers: AI_VIDEO_PROVIDERS });
  if (kind === "daily") return Response.json({ topic: getDailyTopic(), providers: AI_VIDEO_PROVIDERS.filter((provider) => provider.access === "api") });

  const source = url.searchParams.get("source") === "pixabay" ? "pixabay" as const : "pexels" as const;
  const query = clean(url.searchParams.get("query"), 100, getDailyTopic().query);
  const result = await searchStock(source, query);
  return Response.json({ assets: result.assets.map(proxied), message: result.message, source });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio first." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const rawAssets = Array.isArray(body.assets) ? body.assets : [];
    const allowedSources = new Set(["pexels", "pixabay", "pollinations", "manual"]);
    const assets: MediaAsset[] = rawAssets.slice(0, 5).map((asset: any, index: number) => ({
      id: clean(asset.id, 160, `asset-${index}`),
      source: allowedSources.has(asset.source) ? asset.source : "manual",
      title: clean(asset.title, 120, "Imported clip"),
      author: clean(asset.author, 120, "Unknown"),
      authorUrl: clean(asset.authorUrl, 300) || undefined,
      pageUrl: clean(asset.pageUrl, 600, ""),
      downloadUrl: clean(asset.downloadUrl, 1200),
      posterUrl: clean(asset.posterUrl, 1200) || undefined,
      width: number(asset.width, 0) || undefined,
      height: number(asset.height, 0) || undefined,
      duration: number(asset.duration, 0) || undefined,
      tags: Array.isArray(asset.tags) ? asset.tags.filter((tag: unknown) => typeof tag === "string").slice(0, 6).map((tag: string) => tag.slice(0, 40)) : [],
      licenseNote: clean(asset.licenseNote, 300, "Review license before publishing."),
    })).filter((asset: MediaAsset) => asset.downloadUrl.startsWith("https://") || asset.downloadUrl.startsWith("/api/media/proxy") || asset.downloadUrl.startsWith("data:video/"));

    const assembled = assembleDailyProject(assets, {
      title: body.title,
      idea: body.idea,
      category: body.category,
      ageGroup: body.ageGroup,
      duration: number(body.duration, 42),
      character: "fox",
    });
    const [row] = await db.insert(projects).values({
      title: assembled.title,
      idea: assembled.idea,
      category: assembled.category,
      ageGroup: assembled.ageGroup,
      duration: assembled.duration,
      style: assembled.style,
      character: assembled.character,
      scenes: assembled.scenes.map((scene) => ({
        ...scene,
        videoUrl: scene.videoUrl ? mediaToProxyUrl(scene.videoUrl) : undefined,
        videoPosterUrl: scene.videoPosterUrl ? mediaToProxyUrl(scene.videoPosterUrl) : undefined,
        artUrl: scene.artUrl?.startsWith("/api/media/") || scene.artUrl?.startsWith("data:") ? scene.artUrl : scene.artUrl ? mediaToProxyUrl(scene.artUrl) : undefined,
      })),
      status: "draft",
      thumbnail: assembled.thumbnail,
      youtubeTitle: assembled.youtubeTitle,
      description: assembled.description,
      tags: assembled.tags,
      privacy: "private",
    }).returning();
    return Response.json({ project: serializeProject(row), note: assets.length ? "Daily clips were auto-edited into a timeline. Add voices, preview, then export." : "Original daily animation created. Add AI clips when a provider is connected." }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not build the daily short." }, { status: 400 });
  }
}
