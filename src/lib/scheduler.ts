import { after } from "next/server";
import { db } from "@/db";
import { series, videos } from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { NICHES } from "@/lib/generator";
import { runPipeline } from "@/lib/pipeline";

/* In-process autopilot: every minute, fire due series. Priority is correct
   behaviour with a plain `next start` — no external worker required. An
   external cron can also hit /api/cron with the shared secret. */

export function nextRunFrom(frequency: string, from = new Date()): Date {
  const d = new Date(from);
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function pickTopic(niche: string): string {
  const found = NICHES.find((n) => n.id === niche);
  const bank = found?.topics ?? NICHES.flatMap((n) => n.topics);
  return bank[Math.floor(Math.random() * bank.length)];
}

export async function spawnForSeries(s: typeof series.$inferSelect): Promise<string> {
  const topic = pickTopic(s.niche);
  const [v] = await db
    .insert(videos)
    .values({
      seriesId: s.id,
      topic,
      title: `${topic} — forging…`,
      niche: s.niche,
      voice: s.voice,
      style: s.style,
      format: s.format,
      privacy: s.privacy,
      autoUpload: s.autoUpload,
      status: "queued",
    })
    .returning({ id: videos.id });
  after(() => runPipeline(v.id).catch((err) => console.error("pipeline crashed", err)));
  return v.id;
}

const g = globalThis as typeof globalThis & {
  __rfScheduler?: NodeJS.Timeout;
  __rfTicking?: boolean;
};

export async function tick(): Promise<{ fired: number }> {
  if (g.__rfTicking) return { fired: 0 };
  g.__rfTicking = true;
  try {
    const due = await db
      .select()
      .from(series)
      .where(and(eq(series.autopilot, 1), lte(series.nextRunAt, new Date())))
      .limit(3);
    for (const s of due) {
      await db
        .update(series)
        .set({ nextRunAt: nextRunFrom(s.frequency) })
        .where(eq(series.id, s.id));
      await spawnForSeries(s);
      console.log(`[autopilot] fired series "${s.name}" (${s.format}, ${s.frequency})`);
    }
    return { fired: due.length };
  } finally {
    g.__rfTicking = false;
  }
}

export function startScheduler() {
  if (g.__rfScheduler) return;
  g.__rfScheduler = setInterval(() => {
    tick().catch((err) => console.error("scheduler tick failed", err));
  }, 60_000);
  // catch up on boot in case the server slept through a scheduled run
  tick().catch((err) => console.error("scheduler boot tick failed", err));
  console.log("[autopilot] scheduler started — checking every 60s");
}
