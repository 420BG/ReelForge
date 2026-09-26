import { db } from "@/db";
import { series } from "@/db/schema";
import { eq } from "drizzle-orm";
import { spawnForSeries } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s] = await db.select().from(series).where(eq(series.id, id)).limit(1);
  if (!s) return Response.json({ error: "series not found" }, { status: 404 });
  const videoId = await spawnForSeries(s);
  return Response.json({ ok: true, videoId });
}
