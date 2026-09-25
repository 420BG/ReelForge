import { db } from "@/db";
import { series } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NICHES, VOICES, STYLES } from "@/lib/generator";
import { nextRunFrom } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(series).orderBy(desc(series.createdAt));
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const name = String(b.name ?? "").trim().slice(0, 60) || "Untitled series";
  const niche = NICHES.some((n) => n.id === b.niche) ? String(b.niche) : "space";
  const voice = VOICES.some((v) => v.id === b.voice) ? String(b.voice) : "atlas";
  const style = STYLES.some((s) => s.id === b.style) ? String(b.style) : "cinematic";
  const format = b.format === "long" ? "long" : "short";
  const frequency = b.frequency === "weekly" ? "weekly" : "daily";
  const privacy = ["private", "unlisted", "public"].includes(String(b.privacy))
    ? String(b.privacy)
    : "private";
  const autopilot = b.autopilot ? 1 : 0;
  const autoUpload = b.autoUpload ? 1 : 0;

  const [row] = await db
    .insert(series)
    .values({
      name,
      niche,
      voice,
      style,
      format,
      frequency,
      privacy,
      autopilot,
      autoUpload,
      nextRunAt: nextRunFrom(frequency),
    })
    .returning();

  return Response.json({ ok: true, series: row });
}
