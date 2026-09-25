import { db } from "@/db";
import { providerUsage } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const dayKey = () => new Date().toISOString().slice(0, 10); // UTC day

async function row(provider: string) {
  const day = dayKey();
  const existing = await db
    .select()
    .from(providerUsage)
    .where(and(eq(providerUsage.provider, provider), eq(providerUsage.day, day)))
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(providerUsage)
    .values({ provider, day })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await db
    .select()
    .from(providerUsage)
    .where(and(eq(providerUsage.provider, provider), eq(providerUsage.day, day)))
    .limit(1);
  return again[0];
}

export async function isExhausted(provider: string): Promise<boolean> {
  try {
    const r = await row(provider);
    return (r?.exhausted ?? 0) === 1;
  } catch {
    return false;
  }
}

export async function markCall(provider: string) {
  try {
    const r = await row(provider);
    if (r) {
      await db
        .update(providerUsage)
        .set({ calls: r.calls + 1 })
        .where(eq(providerUsage.id, r.id));
    }
  } catch (err) {
    console.error("usage tracking failed", err);
  }
}

export async function markFailure(provider: string, exhausted = false) {
  try {
    const r = await row(provider);
    if (r) {
      await db
        .update(providerUsage)
        .set({ failures: r.failures + 1, exhausted: exhausted ? 1 : r.exhausted })
        .where(eq(providerUsage.id, r.id));
    }
  } catch (err) {
    console.error("usage tracking failed", err);
  }
}

export function looksLikeQuotaError(status: number, text: string): boolean {
  if (status === 429) return true;
  const t = text.toLowerCase();
  return (
    t.includes("rate limit") ||
    t.includes("quota") ||
    t.includes("resource_exhausted") ||
    t.includes("too many requests")
  );
}
