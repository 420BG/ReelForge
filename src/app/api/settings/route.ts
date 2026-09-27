import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function ensureRow() {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  if (row) return row;
  const [created] = await db.insert(appSettings).values({ id: 1 }).returning();
  return created;
}

export async function GET() {
  try {
    const row = await ensureRow();
    return Response.json({ dailyGoal: row.dailyGoal, timezone: row.timezone });
  } catch (err) {
    console.error("failed to load settings:", err);
    return Response.json(
      { error: err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : "failed to load settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    await ensureRow();
    const patch: Partial<typeof appSettings.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.dailyGoal === "number" && body.dailyGoal > 0) patch.dailyGoal = Math.floor(body.dailyGoal);
    if (typeof body.timezone === "string" && body.timezone.trim()) patch.timezone = body.timezone.trim();

    const [row] = await db.update(appSettings).set(patch).where(eq(appSettings.id, 1)).returning();
    return Response.json({ dailyGoal: row.dailyGoal, timezone: row.timezone });
  } catch (err) {
    console.error("failed to update settings:", err);
    return Response.json(
      { error: err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : "failed to update settings" },
      { status: 500 },
    );
  }
}
