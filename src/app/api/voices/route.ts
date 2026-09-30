import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ voices: [], error: "Add ELEVENLABS_API_KEY in your server environment to browse lifelike voices." });
  try {
    const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100&voice_type=default", {
      headers: { "xi-api-key": key }, signal: AbortSignal.timeout(12000), cache: "no-store",
    });
    if (!response.ok) return Response.json({ voices: [], error: `ElevenLabs could not list voices (${response.status}). Check your key in Settings.` });
    const data = await response.json();
    const voices = Array.isArray(data.voices) ? data.voices.filter((voice: Record<string, unknown>) => typeof voice.voice_id === "string").map((voice: { voice_id: string; name?: string; description?: string; labels?: { accent?: string; gender?: string } }) => ({
      id: voice.voice_id,
      name: voice.name || "Untitled voice",
      description: [voice.labels?.accent, voice.labels?.gender].filter(Boolean).join(" · ") || (voice.description || "Natural voice").slice(0, 70),
    })).slice(0, 60) : [];
    return Response.json({ voices });
  } catch {
    return Response.json({ voices: [], error: "Could not load ElevenLabs voices right now." });
  }
}
