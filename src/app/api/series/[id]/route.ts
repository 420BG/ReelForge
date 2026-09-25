import { db } from "@/db";
import { series } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nextRunFrom } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const values: Record<string, unknown> = {};
  if ("autopilot" in b) {
    values.autopilot = b.autopilot ? 1 : 0;
    // re-arm the schedule so an enabled series starts counting from now
    const [s] = await db.select().from(series).where(eq(series.id, id)).limit(1);
    if (s) values.nextRunAt = nextRunFrom(s.frequency);
  }
  if ("autoUpload" in b) values.autoUpload = b.autoUpload ? 1 : 0;
  if ("privacy" in b && ["private", "unlisted", "public"].includes(String(b.privacy))) {
    values.privacy = String(b.privacy);
  }
  if (Object.keys(values).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }

  await db.update(series).set(values).where(eq(series.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(series).where(eq(series.id, id));
  return Response.json({ ok: true });
}
