import { isAuthenticated } from "@/lib/auth";
import { getIntegration } from "@/lib/youtube";
import { getAutoSettings, hydrateSecrets, saveAutoSettings, saveSecrets, secretStatus, type SecretName } from "@/lib/keys";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  await hydrateSecrets();
  const integration = await getIntegration();
  return Response.json({
    secrets: secretStatus(),
    auto: await getAutoSettings(),
    youtubeConnected: Boolean(integration?.youtubeRefreshToken),
    youtubeChannelTitle: integration?.youtubeChannelTitle || null,
  });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const updates: Partial<Record<SecretName, string>> = {};
    const clears: SecretName[] = [];
    const validNames = new Set<string>([
      "OPENROUTER_API_KEY", "POLLINATIONS_API_KEY", "ELEVENLABS_API_KEY", "PEXELS_API_KEY", "PIXABAY_API_KEY", "FAL_KEY", "REPLICATE_API_TOKEN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
    ]);
    if (body.updates && typeof body.updates === "object") {
      for (const [name, value] of Object.entries(body.updates as Record<string, unknown>)) {
        if (validNames.has(name) && typeof value === "string" && value.trim()) updates[name as SecretName] = value.trim().slice(0, 500);
      }
    }
    if (Array.isArray(body.clears)) for (const name of body.clears) if (typeof name === "string" && validNames.has(name)) clears.push(name as SecretName);
    await saveSecrets(updates, clears);
    let auto;
    if (body.auto && typeof body.auto === "object") auto = await saveAutoSettings(body.auto);
    else auto = await getAutoSettings();
    return Response.json({ secrets: secretStatus(), auto, applied: Object.keys(updates).length + clears.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save your settings." }, { status: 400 });
  }
}
