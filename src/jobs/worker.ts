import { after } from "next/server";
import { q } from "@/jobs/repo";
import { tick } from "@/jobs/runner";

/**
 * Keeps generation moving on serverless without the dashboard open.
 * A request works for up to ~4 minutes (one small unit at a time), then — if more work is
 * due soon — calls /api/agent/kick again with CRON_SECRET, which continues the chain.
 * Long provider waits (quota resets) stop the chain; the next cron ping or dashboard visit resumes it.
 */

const MAX_HOPS = 400;

export async function workFor(budgetMs: number) {
  const started = Date.now();
  let ran = 0;
  while (Date.now() - started < budgetMs) {
    const result = await tick(1, 5_000);
    if (result.busy || result.ran === 0) break;
    ran += result.ran;
  }
  return ran;
}

/** True when some job can run within `seconds`. */
export async function workDueSoon(seconds = 75) {
  const rows = await q<{ n: number }>(
    "SELECT count(*)::int AS n FROM agent_jobs WHERE state IN ('queued','running','waiting') AND next_run_at <= now() + ($1 || ' seconds')::interval",
    [String(seconds)],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export function kickEnabled() {
  return Boolean(process.env.CRON_SECRET) && Boolean(process.env.VERCEL) && process.env.AGENT_SELF_KICK !== "off";
}

/** Schedules the next hop after this response is sent (fire-and-forget). */
export function continueInBackground(origin: string, hop = 0) {
  if (!kickEnabled() || hop >= MAX_HOPS) return false;
  after(async () => {
    try {
      if (!(await workDueSoon())) return;
      const headers: Record<string, string> = { "x-cron-secret": process.env.CRON_SECRET ?? "" };
      if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      // Only wait long enough for the request to be accepted; the next function keeps running on its own.
      await fetch(`${origin}/api/agent/kick?hop=${hop + 1}`, { method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
    } catch { /* the next cron ping / dashboard poll resumes */ }
  });
  return true;
}
