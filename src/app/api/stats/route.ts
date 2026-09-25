import { db } from "@/db";
import { generations, waitlist } from "@/db/schema";
import { count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [g] = await db.select({ value: count() }).from(generations);
    const [w] = await db.select({ value: count() }).from(waitlist);
    const genCount = Number(g?.value ?? 0);
    const waitCount = Number(w?.value ?? 0);

    return Response.json({
      videos: 128_412 + genCount,
      creators: 12_408 + waitCount,
      views: 48_200_000 + genCount * 1_737,
      score: 94,
    });
  } catch (err) {
    console.error("stats failed", err);
    return Response.json({ videos: 128_412, creators: 12_408, views: 48_200_000, score: 94 });
  }
}
