import { after } from "next/server";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runPipeline } from "@/lib/pipeline";
import { deleteFromSupabase } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  after(() => runPipeline(id).catch((err) => console.error("pipeline crashed", err)));
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (v) {
    await deleteFromSupabase([v.videoRel, v.thumbRel]);
  }
  await db.delete(videos).where(eq(videos.id, id));
  return Response.json({ ok: true });
}
