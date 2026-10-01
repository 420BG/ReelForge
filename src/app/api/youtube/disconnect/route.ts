import { db } from "@/db";
import { studioIntegrations } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { decryptToken, getIntegration } from "@/lib/youtube";

export async function POST() {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  const integration = await getIntegration();
  if (integration?.youtubeRefreshToken) {
    try {
      const token = decryptToken(integration.youtubeRefreshToken);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(5000),
      });
    } catch { /* A local disconnect should still succeed if Google is unavailable. */ }
  }
  await db.delete(studioIntegrations);
  return Response.json({ ok: true });
}
