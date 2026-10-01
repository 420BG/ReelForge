import { tick } from "@/lib/scheduler";
import { tick as agentTick } from "@/jobs/runner";
import { runDailySchedule } from "@/jobs/scheduler";
import { continueInBackground } from "@/jobs/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const result = await tick();
  // Also advance queued Agent jobs by one step. Isolated so it can never break the series scheduler above.
  let agent: { ran: number; busy?: boolean } | { error: string } = { ran: 0 };
  try {
    agent = await agentTick();
  } catch (err) {
    agent = { error: err instanceof Error ? err.message : "agent tick failed" };
  }
  // Daily Short/Long schedule + keep long generations moving in the background.
  let daily: unknown = [];
  try { daily = await runDailySchedule(); } catch (err) { daily = { error: err instanceof Error ? err.message : "schedule failed" }; }
  const chained = continueInBackground(new URL(request.url).origin);
  return Response.json({ ok: true, ...result, agent, daily, chained });
}
