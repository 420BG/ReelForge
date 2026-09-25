import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { STORAGE, ensureStorage } from "@/lib/pipeline/render";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action !== "retry") {
    return Response.json({ error: "unsupported action" }, { status: 400 });
  }
  const [v] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!v) return Response.json({ error: "not found" }, { status: 404 });
  await db
    .update(videos)
    .set({ status: "queued", error: null, videoRel: null, thumbRel: null })
    .where(eq(videos.id, id));
  runPipeline(id).catch((err) => console.error("pipeline crashed", err));
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (v) {
    await ensureStorage();
    const jobs: Promise<unknown>[] = [];
    if (v.videoRel) jobs.push(fs.unlink(path.join(STORAGE, v.videoRel)).catch(() => {}));
    if (v.thumbRel) jobs.push(fs.unlink(path.join(STORAGE, v.thumbRel)).catch(() => {}));
    jobs.push(fs.rm(path.join(STORAGE, "videos", id), { recursive: true, force: true }).catch(() => {}));
    await Promise.all(jobs);
  }
  await db.delete(videos).where(eq(videos.id, id));
  return Response.json({ ok: true });
}
