import { isAuthenticated } from "@/lib/auth";
import { childSafeVideoPrompt } from "@/lib/discovery";
import type { MediaAsset } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio first." }, { status: 401 });
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return Response.json({ error: "Add POLLINATIONS_API_KEY to generate AI video clips. The free web providers and stock browser remain available as guided workflows." }, { status: 400 });

  try {
    const body = await request.json().catch(() => ({}));
    const prompt = childSafeVideoPrompt(clean(body.prompt, 700));
    if (prompt.length < 20) return Response.json({ error: "Describe the video clip in at least a few words." }, { status: 400 });
    const duration = [5, 10].includes(Number(body.duration)) ? Number(body.duration) : 5;
    const url = new URL(`https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}`);
    url.searchParams.set("duration", String(duration));
    url.searchParams.set("aspectRatio", "9:16");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(170000),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 220);
      return Response.json({ error: `AI video provider returned ${response.status}. ${detail}` }, { status: 502 });
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("video/")) {
      await response.body?.cancel();
      return Response.json({ error: "The video provider did not return an MP4. Try a provider from the web-app hub." }, { status: 502 });
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 12_000_000) return Response.json({ error: "The generated clip is larger than the 12 MB project limit. Use a provider web app and download a smaller clip." }, { status: 502 });
    const mimeType = contentType.split(";")[0] || "video/mp4";
    const asset: MediaAsset = {
      id: `pollinations-${Date.now()}`,
      source: "pollinations",
      title: prompt.slice(0, 90),
      author: "Pollinations generated clip",
      pageUrl: "https://pollinations.ai/play",
      downloadUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
      duration,
      tags: ["AI video", "kids cartoon", "vertical short"],
      licenseNote: "AI-generated clip. Review Pollinations model rights, provenance, and commercial terms before publishing.",
      aiGenerated: true,
    };
    return Response.json({ asset });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "AI video generation failed." }, { status: 500 });
  }
}
