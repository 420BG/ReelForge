import type { MediaAsset } from "@/lib/types";

const clean = (value: unknown, max: number, fallback = "") => typeof value === "string" ? value.trim().slice(0, max) : fallback;
const number = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function pexelsFile(file: any) {
  return file?.file_type === "video/mp4" && file?.link ? file : null;
}

function normalizePexels(hit: any): MediaAsset | null {
  const files = Array.isArray(hit?.video_files) ? hit.video_files.map(pexelsFile).filter(Boolean) : [];
  const portrait = files.filter((file: any) => Number(file.height) >= Number(file.width)).sort((a: any, b: any) => Math.abs((a.height || 720) - 720) - Math.abs((b.height || 720) - 720))[0];
  const chosen = portrait || files.sort((a: any, b: any) => Math.abs((b.height || 0) - 720) - Math.abs((a.height || 0) - 720))[0];
  if (!chosen?.link) return null;
  return {
    id: `pexels-${hit.id}`,
    source: "pexels",
    title: clean(hit.url?.split("/")[3] || "Pexels video", 120, "Royalty-free video"),
    author: clean(hit.user?.name, 120, "Pexels creator"),
    authorUrl: hit.user?.url,
    pageUrl: hit.url || "https://www.pexels.com/videos/",
    downloadUrl: chosen.link,
    posterUrl: hit.image,
    width: number(chosen.width, 0) || undefined,
    height: number(chosen.height, 0) || undefined,
    duration: number(hit.duration, 0) || undefined,
    tags: clean(hit.tags || hit.url, 180, "kids nature video").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 6),
    licenseNote: "Pexels License — free for personal/commercial use; credit appreciated.",
  };
}

function normalizePixabay(hit: any): MediaAsset | null {
  const chosen = hit?.videos?.medium?.url || hit?.videos?.small?.url || hit?.videos?.large?.url || hit?.videos?.tiny?.url;
  const rendition = hit?.videos?.medium || hit?.videos?.small || hit?.videos?.large || hit?.videos?.tiny;
  if (!chosen) return null;
  return {
    id: `pixabay-${hit.id}`,
    source: "pixabay",
    title: clean(hit.tags, 120, "Pixabay video"),
    author: clean(hit.user, 120, "Pixabay creator"),
    authorUrl: `https://pixabay.com/users/${encodeURIComponent(hit.user || "user")}-${hit.user_id || ""}/`,
    pageUrl: hit.pageURL || "https://pixabay.com/videos/",
    downloadUrl: chosen,
    posterUrl: rendition?.thumbnail,
    width: number(rendition?.width, 0) || undefined,
    height: number(rendition?.height, 0) || undefined,
    duration: number(hit.duration, 0) || undefined,
    tags: clean(hit.tags, 180, "kids, nature").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 6),
    licenseNote: "Pixabay Content License — source attribution is displayed in this studio.",
  };
}

export async function searchPexels(query: string) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return { assets: [], message: "Add PEXELS_API_KEY to browse Pexels videos inside the studio." };
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("size", "medium");
  url.searchParams.set("min_duration", "3");
  url.searchParams.set("max_duration", "18");
  url.searchParams.set("per_page", "24");
  url.searchParams.set("page", "1");
  const response = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!response.ok) return { assets: [], message: `Pexels returned ${response.status}. Check the API key and rate limit.` };
  const data = await response.json();
  return { assets: (data.videos || []).map(normalizePexels).filter(Boolean) as MediaAsset[], message: null as string | null };
}

export async function searchPixabay(query: string) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return { assets: [], message: "Add PIXABAY_API_KEY to browse Pixabay videos inside the studio." };
  const url = new URL("https://pixabay.com/api/videos/");
  url.searchParams.set("key", key);
  url.searchParams.set("q", query);
  url.searchParams.set("video_type", "film");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("orientation", "vertical");
  url.searchParams.set("per_page", "24");
  url.searchParams.set("min_width", "540");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!response.ok) return { assets: [], message: `Pixabay returned ${response.status}. Check the API key and rate limit.` };
  const data = await response.json();
  return { assets: (data.hits || []).map(normalizePixabay).filter(Boolean) as MediaAsset[], message: null as string | null };
}

export async function searchStock(source: "pexels" | "pixabay", query: string) {
  return source === "pixabay" ? searchPixabay(query) : searchPexels(query);
}
