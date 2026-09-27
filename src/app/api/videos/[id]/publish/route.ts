import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { uploadToYouTube } from "@/lib/pipeline/upload";
import { downloadToFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  const [v] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!v) return Response.json({ error: "video not found" }, { status: 404 });
  if (!v.videoRel) return Response.json({ error: "video hasn't finished rendering yet" }, { status: 400 });
  if (v.youtubeId) return Response.json({ error: "already published to YouTube" }, { status: 400 });

  const script = (v.script ?? {}) as { title?: string; description?: string; tags?: string[] };
  const title = String(body.title ?? script.title ?? v.title).slice(0, 100);
  const description = String(body.description ?? script.description ?? "");
  const tags = Array.isArray(body.tags)
    ? body.tags.map(String)
    : Array.isArray(script.tags)
      ? script.tags.map(String)
      : [];
  const privacy = ["private", "unlisted", "public"].includes(String(body.privacy))
    ? (String(body.privacy) as "private" | "unlisted" | "public")
    : (v.privacy as "private" | "unlisted" | "public");

  const tmpPath = path.join(os.tmpdir(), `publish-${id}.mp4`);
  try {
    await downloadToFile(v.videoRel, tmpPath);
    const res = await uploadToYouTube({ filePath: tmpPath, title, description, tags, privacy });
    await db
      .update(videos)
      .set({ youtubeId: res.id, postedAt: new Date(), status: "posted", privacy, title })
      .where(eq(videos.id, id));
    return Response.json({ ok: true, youtubeId: res.id, url: res.url });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "publish failed" },
      { status: 500 },
    );
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
  }
}
