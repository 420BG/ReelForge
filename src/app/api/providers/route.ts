import { db } from "@/db";
import { providerUsage } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PROVIDERS, isConfigured } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const day = new Date().toISOString().slice(0, 10);
  let usage: (typeof providerUsage.$inferSelect)[] = [];
  try {
    usage = await db.select().from(providerUsage).where(eq(providerUsage.day, day));
  } catch {
    /* fresh database */
  }

  const items = PROVIDERS.map((p) => {
    const u = usage.find((x) => x.provider === p.id);
    return {
      ...p,
      configured: isConfigured(p),
      callsToday: u?.calls ?? 0,
      failuresToday: u?.failures ?? 0,
      exhausted: (u?.exhausted ?? 0) === 1,
    };
  });
  return Response.json({ items, day });
}
