import { after } from "next/server";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NICHES, VOICES, STYLES } from "@/lib/generator";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const rows = await db.select().from(videos).orderBy(desc(videos.createdAt)).limit(40);
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const topic = String(b.topic ?? "").trim().replace(/\s+/g, " ").slice(0, 90);
  if (!topic) return Response.json({ error: "topic is required" }, { status: 400 });

  const niche = NICHES.some((n) => n.id === b.niche) ? String(b.niche) : "custom";
  const voice = VOICES.some((v) => v.id === b.voice) ? String(b.voice) : "nova";
  const style = STYLES.some((s) => s.id === b.style) ? String(b.style) : "cinematic";
  const format = b.format === "long" ? "long" : "short";
  const privacy = ["private", "unlisted", "public"].includes(String(b.privacy))
    ? String(b.privacy)
    : "private";
  const autoUpload = b.autoUpload ? 1 : 0;

  const [v] = await db
    .insert(videos)
    .values({
      topic,
      title: `${topic} — forging…`,
      niche,
      voice,
      style,
      format,
      privacy,
      autoUpload,
      status: "queued",
    })
    .returning({ id: videos.id });

  after(() => runPipeline(v.id).catch((err) => console.error("pipeline crashed", err)));
  return Response.json({ ok: true, videoId: v.id });
}
