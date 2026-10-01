import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/auth";
import { runDailySchedule } from "@/jobs/scheduler";
import { continueInBackground, workFor } from "@/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Background worker hop: checks the daily schedule, works for a few minutes, then hands off
 * to the next hop if more work is due. Auth: CRON_SECRET (x-cron-secret or Bearer) or a session.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const custom = request.headers.get("x-cron-secret");
  const bySecret = Boolean(secret) && (bearer === `Bearer ${secret}` || custom === secret);
  if (!bySecret && !(await verifySessionValue((await cookies()).get(SESSION_COOKIE)?.value))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const hop = Math.max(0, Math.min(10_000, Number(url.searchParams.get("hop")) || 0));
  let daily: unknown = [];
  try { daily = await runDailySchedule(); } catch (error) { daily = { error: error instanceof Error ? error.message : "schedule failed" }; }
  // Start new units for ~2.5 min; a unit that starts late still has room before the 300 s limit.
  const ran = await workFor(process.env.VERCEL ? 150_000 : 20_000);
  const chained = continueInBackground(url.origin, hop);
  return Response.json({ ok: true, ran, hop, chained, daily });
}

export const GET = handle;
export const POST = handle;
