import { isAuthenticated } from "@/lib/auth";
import { hydrateSecrets } from "@/lib/keys";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same session check every existing route uses. Returns a 401 Response, or null when allowed. */
export async function guard(): Promise<Response | null> {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio first." }, { status: 401 });
  await hydrateSecrets();
  return null;
}

export function fail(error: unknown, status = 400) {
  return Response.json({ error: error instanceof Error ? error.message : "Something went wrong." }, { status });
}
