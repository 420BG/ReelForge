import { db } from "@/db";
import { generations } from "@/db/schema";
import {
  generateShort,
  NICHES,
  VOICES,
  STYLES,
  type NicheId,
  type VoiceId,
  type StyleId,
} from "@/lib/generator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const topic = String(body.topic ?? "").trim().replace(/\s+/g, " ").slice(0, 90);
  if (!topic) {
    return Response.json({ error: "Give the forge a topic first." }, { status: 400 });
  }

  const niche = NICHES.some((n) => n.id === body.niche) ? (body.niche as NicheId) : "custom";
  const voice = VOICES.some((v) => v.id === body.voice) ? (body.voice as VoiceId) : "nova";
  const style = STYLES.some((s) => s.id === body.style) ? (body.style as StyleId) : "cinematic";
  const variant = Number.isInteger(body.variant) ? Math.max(0, Number(body.variant)) : 0;

  const short = generateShort({ topic, niche, voice, style, variant });

  try {
    await db.insert(generations).values({
      topic: short.topic,
      niche: short.niche,
      voice: short.voice,
      style: short.style,
      title: short.title,
      score: short.score,
      duration: Math.round(short.duration * 1000),
      scenes: short.scenes,
    });
  } catch (err) {
    // The draft still ships even if persistence hiccups — log and continue.
    console.error("failed to persist generation", err);
  }

  return Response.json({ ok: true, short });
}
