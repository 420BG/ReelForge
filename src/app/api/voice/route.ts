import { db } from "@/db";
import { projects } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { serializeProject } from "@/lib/projects";
import { normalizeEditorSettings } from "@/lib/timeline";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  try {
    const { projectId, sceneId } = await request.json();
    if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) return Response.json({ error: "Invalid project." }, { status: 400 });
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    const scene = project.scenes.find((item) => item.id === sceneId);
    if (!scene) return Response.json({ error: "Scene not found." }, { status: 404 });
    if (!scene.narration.trim()) return Response.json({ error: "Write a narration line before making a voice." }, { status: 400 });
    const settings = normalizeEditorSettings(project.editSettings);
    let response: Response;
    if (settings.voiceProvider === "elevenlabs") {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) return Response.json({ error: "Add ELEVENLABS_API_KEY on the server to generate this voice." }, { status: 400 });
      if (!/^[a-zA-Z0-9_-]{8,80}$/.test(settings.voiceId)) return Response.json({ error: "Choose an available ElevenLabs voice in the Voice tab." }, { status: 400 });
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(settings.voiceId)}?output_format=mp3_22050_32`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: scene.narration.slice(0, 450),
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.42, similarity_boost: 0.75, style: 0.18, use_speaker_boost: true },
        }),
        signal: AbortSignal.timeout(90000), cache: "no-store",
      });
    } else {
      const key = process.env.POLLINATIONS_API_KEY;
      if (!key) return Response.json({ error: "Add POLLINATIONS_API_KEY on the server to generate Kokoro voice clips. Provider credits may be required." }, { status: 400 });
      const url = `https://gen.pollinations.ai/audio/${encodeURIComponent(scene.narration.slice(0, 450))}?model=hexgrad%2Fkokoro-82m&voice=${encodeURIComponent(settings.voiceId)}&response_format=mp3`;
      response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(90000), cache: "no-store" });
    }
    if (!response.ok) {
      const hint = response.status === 402 || response.status === 429 ? "Check your provider's credits or rate limit." : "Check your key and voice selection.";
      return Response.json({ error: `Voice provider returned ${response.status}. ${hint}` }, { status: 502 });
    }
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    if (!contentType.startsWith("audio/")) throw new Error("The voice provider did not return an audio file.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 4_000_000) throw new Error("The generated voice clip is too large to save.");
    const audioData = `data:audio/mpeg;base64,${bytes.toString("base64")}`;
    const [updated] = await db.update(projects).set({
      scenes: project.scenes.map((item) => item.id === sceneId ? { ...item, audioData, audioSource: "generated" as const } : item),
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId)).returning();
    return Response.json({ project: serializeProject(updated) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Voice generation failed." }, { status: 500 });
  }
}
