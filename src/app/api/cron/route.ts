import { tick } from "@/lib/scheduler";
import { tick as agentTick } from "@/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const result = await tick();
  // Also advance queued Agent jobs by one step. Isolated so it can never break the series scheduler above.
  let agent: { ran: number; busy?: boolean } | { error: string } = { ran: 0 };
  try {
    agent = await agentTick();
  } catch (err) {
    agent = { error: err instanceof Error ? err.message : "agent tick failed" };
  }
  return Response.json({ ok: true, ...result, agent });
}
