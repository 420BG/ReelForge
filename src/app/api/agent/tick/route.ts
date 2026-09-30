import { fail, guard } from "@/jobs/api-helpers";
import { DEFAULT_UNITS, tick } from "@/jobs/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Advances queued jobs by a bounded amount of work. The dashboard calls this while open,
 * so jobs progress even on hosts where the background interval is asleep (e.g. Autoscale).
 * Leases in the DB make concurrent ticks safe.
 */
export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const result = await tick(DEFAULT_UNITS, 20_000);
    return Response.json(result);
  } catch (error) {
    return fail(error, 500);
  }
}
