import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/auth";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Same session as the rest of ReelForge. The middleware already blocks unauthenticated
 * /api requests; this re-checks inside the route as defence in depth.
 */
export async function guard(): Promise<Response | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionValue(value))) return Response.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

export function fail(error: unknown, status = 400) {
  return Response.json({ error: error instanceof Error ? error.message : "Something went wrong." }, { status });
}
