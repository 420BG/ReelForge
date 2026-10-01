import type { PlanScene, StoryPlan } from "@/content/types";
import { isExhausted, markCall, markFailure } from "@/lib/pipeline/usage";
import { downloadMedia, httpRetryable, ProviderError, type ClipResult } from "@/video/providers/types";

/**
 * STOCK VIDEO mode — free, real (not AI-generated) footage from Pexels / Pixabay.
 * Used only when it is switched on in Agent settings and no AI video provider is available.
 * Videos made this way are labelled "STOCK VIDEO" in the app and in the YouTube description.
 * Both libraries allow free commercial use; we still record the creator + page for credit.
 */

export type StockClip = ClipResult & { source: "pexels" | "pixabay"; stockId: string; credit: string; pageUrl: string; query: string };

type Candidate = { id: string; url: string; width: number; height: number; duration: number; credit: string; pageUrl: string };

const STOP = new Set("the a an and or but of in on at to for with from into onto over under by as is are was were be been being this that these those it its his her their our your my we you they he she them him who whom which what when where while then than very just only also still even ever never not no yes there here some any each every both few more most other such own same so too can will would should could may might must shall do does did done have has had having about above after again against all am because before below between during further once out through until up down off why how scene shot camera close closeup wide view slowly slow moving looking looks standing sitting holding shows showing cinematic dramatic lighting light style frame vertical".split(" "));

/** 2–4 plain search words from the scene's visual description (stock search wants nouns, not prose). */
export function stockQuery(scene: Pick<PlanScene, "visual" | "caption">, story: Pick<StoryPlan, "setting" | "niche">) {
  const words = `${scene.visual} ${scene.caption}`.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const unique = Array.from(new Set(words));
  const picked = unique.slice(0, 3);
  if (!picked.length) return (story.setting || story.niche).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 3).join(" ") || "nature";
  return picked.join(" ");
}

export function stockConfigured() {
  return Boolean(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
}

export function stockProviderStatus() {
  return [
    { id: "pexels-video", label: "Pexels Videos (stock)", env: "PEXELS_API_KEY", configured: Boolean(process.env.PEXELS_API_KEY) },
    { id: "pixabay-video", label: "Pixabay Videos (stock)", env: "PIXABAY_API_KEY", configured: Boolean(process.env.PIXABAY_API_KEY) },
  ];
}

async function pexels(query: string): Promise<Candidate[]> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=15`;
  const response = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY ?? "" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new ProviderError(`Pexels returned ${response.status}.`, httpRetryable(response.status), response.status);
  const data = await response.json() as { videos?: { id: number; url: string; duration: number; user?: { name?: string }; video_files?: { link: string; width: number; height: number; file_type?: string }[] }[] };
  return (data.videos ?? []).flatMap((video) => {
    const files = (video.video_files ?? []).filter((file) => file.link?.startsWith("https://") && (file.file_type ?? "video/mp4").includes("mp4") && file.height >= file.width);
    // Smallest file that is still at least 1280 tall, else the biggest available.
    const good = files.filter((file) => file.height >= 1280).sort((a, b) => a.height - b.height)[0] ?? files.sort((a, b) => b.height - a.height)[0];
    return good ? [{ id: `pexels-${video.id}`, url: good.link, width: good.width, height: good.height, duration: video.duration, credit: video.user?.name ?? "Pexels", pageUrl: video.url }] : [];
  });
}

async function pixabay(query: string, safe: boolean): Promise<Candidate[]> {
  const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(process.env.PIXABAY_API_KEY ?? "")}&q=${encodeURIComponent(query)}&per_page=20&safesearch=${safe ? "true" : "false"}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new ProviderError(`Pixabay returned ${response.status}.`, httpRetryable(response.status), response.status);
  const data = await response.json() as { hits?: { id: number; pageURL: string; duration: number; user?: string; videos?: Record<string, { url: string; width: number; height: number }> }[] };
  return (data.hits ?? []).flatMap((hit) => {
    const files = Object.values(hit.videos ?? {}).filter((file) => file?.url?.startsWith("https://") && file.width > 0);
    // Pixabay is mostly landscape; prefer portrait, else a ≤1920-wide landscape file (cropped to 9:16 later).
    const tall = files.filter((file) => file.height >= file.width).sort((a, b) => a.height - b.height);
    const portrait = tall.find((file) => file.height >= 1280) ?? tall[tall.length - 1];
    const landscape = files.filter((file) => file.width <= 1920).sort((a, b) => b.width - a.width)[0];
    const good = portrait ?? landscape;
    return good ? [{ id: `pixabay-${hit.id}`, url: good.url, width: good.width, height: good.height, duration: hit.duration, credit: hit.user ?? "Pixabay", pageUrl: hit.pageURL }] : [];
  });
}

/**
 * Finds and downloads one stock clip for a scene. `avoid` = stock ids already used in this video
 * so scenes don't repeat. Throws a non-retryable error when nothing matches (caller may fall back).
 */
export async function stockClipFor(scene: PlanScene, story: StoryPlan, opts: { seed: number; avoid: Set<string> }): Promise<StockClip> {
  const queries = Array.from(new Set([stockQuery(scene, story), stockQuery({ visual: story.setting, caption: "" }, story)]));
  const errors: string[] = [];
  for (const query of queries) {
    const sources: ["pexels" | "pixabay", () => Promise<Candidate[]>][] = [];
    if (process.env.PEXELS_API_KEY) sources.push(["pexels", () => pexels(query)]);
    if (process.env.PIXABAY_API_KEY) sources.push(["pixabay", () => pixabay(query, true)]);
    for (const [source, search] of sources) {
      const usageId = `${source}-video`;
      if (await isExhausted(usageId)) { errors.push(`${source}: daily quota used`); continue; }
      let candidates: Candidate[];
      try { candidates = await search(); await markCall(usageId); }
      catch (error) {
        const status = error instanceof ProviderError ? error.status : undefined;
        await markFailure(usageId, status === 429);
        errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const fresh = candidates.filter((candidate) => !opts.avoid.has(candidate.id) && candidate.duration >= 3);
      if (!fresh.length) { errors.push(`${source}: no match for “${query}”`); continue; }
      const pick = fresh[opts.seed % Math.min(fresh.length, 5)];
      const media = await downloadMedia(pick.url, "video");
      return { ...media, source, stockId: pick.id, credit: pick.credit, pageUrl: pick.pageUrl, query };
    }
  }
  const retryable = errors.some((error) => /quota|returned (429|5\d\d)/.test(error));
  throw new ProviderError(`No stock clip found (${errors.join("; ") || "no stock key configured"}).`, retryable);
}
