import { createHash, timingSafeEqual } from "node:crypto";
import { DEFAULT_UNITS, tick } from "@/jobs/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Called every minute by an external scheduler (cron-job.org, GitHub Actions, or Vercel Cron on Pro)
 * with header `Authorization: Bearer <CRON_SECRET>`. Advances queued agent jobs by one unit.
 * No session cookie is involved, so it is protected by the secret only. Returns no data.
 */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ error: "CRON_SECRET is not set on the server." }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await tick(DEFAULT_UNITS, 20_000);
    return Response.json({ ok: true, ran: result.ran, busy: result.busy });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "tick failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
