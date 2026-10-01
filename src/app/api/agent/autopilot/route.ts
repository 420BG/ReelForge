import { fail, guard } from "@/jobs/api-helpers";
import { startAutopilotBatch } from "@/jobs/autopilot";
import { continueInBackground } from "@/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** New batch Autopilot. The existing daily /api/autopilot route is unchanged and separate. */
export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await startAutopilotBatch({
      niche: typeof body.niche === "string" ? body.niche : "auto",
      count: Number(body.count) || 1,
      minDuration: Number(body.minDuration) || 30,
      maxDuration: Number(body.maxDuration) || 45,
      settings: typeof body.settings === "object" && body.settings ? body.settings : {},
    });
    continueInBackground(new URL(request.url).origin);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
