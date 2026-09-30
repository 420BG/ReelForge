import { db } from "@/db";
import { projects } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { serializeProject } from "@/lib/projects";
import type { StoryScene } from "@/lib/types";
import { MAX_SHORT_SECONDS, normalizeEditorSettings, sceneDefaults } from "@/lib/timeline";
import { isSafeMediaUrl } from "@/lib/media-url";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function validId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(_request: Request, context: Context) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!row) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json({ project: serializeProject(row) });
}

export async function PUT(request: Request, context: Context) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  try {
    const body = await request.json();
    const scenes = body?.scenes as StoryScene[];
    if (typeof body?.title !== "string" || !body.title.trim() || body.title.length > 120) throw new Error("Add a title under 120 characters.");
    if (!Array.isArray(scenes) || scenes.length < 1 || scenes.length > 8 || scenes.some((s) => !s.id || typeof s.caption !== "string" || typeof s.narration !== "string" || typeof s.visualPrompt !== "string")) throw new Error("A project needs 1–8 complete scenes.");
    if (!["draft", "ready", "published"].includes(body.status)) throw new Error("Invalid status.");
    if (!["private", "unlisted", "public"].includes(body.privacy)) throw new Error("Invalid visibility.");
    const fallbackDuration = Number(body.duration) / scenes.length;
    const durations = scenes.map((scene) => scene.duration == null ? fallbackDuration : Number(scene.duration));
    if (durations.some((seconds) => !Number.isFinite(seconds) || seconds < 2 || seconds > 20)) throw new Error("Each scene must last between 2 and 20 seconds.");
    const totalDuration = durations.reduce((sum, seconds) => sum + seconds, 0);
    if (totalDuration > MAX_SHORT_SECONDS || totalDuration < 2) throw new Error(`Keep your Short under ${MAX_SHORT_SECONDS} seconds.`);
    const allowedMotion = ["bounce", "walk", "dance", "float", "wave"];
    const allowedCamera = ["push-in", "pan-left", "pan-right", "steady"];
    const allowedTransition = ["fade", "slide", "pop", "cut"];
    const allowedExpression = ["happy", "excited", "curious", "sleepy", "surprised"];
    const normalizedScenes = scenes.map((scene, index) => {
      const defaults = sceneDefaults(index);
      const artIsDataImage = /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(scene.artUrl || "");
      if (scene.artUrl && (!isSafeMediaUrl(scene.artUrl) || (artIsDataImage && scene.artUrl.length > 8_000_000))) throw new Error("Use a safe PNG, JPEG, WebP image, or approved media URL.");
      if (scene.videoUrl && !isSafeMediaUrl(scene.videoUrl)) throw new Error("Only approved, proxied stock/AI video URLs can be saved.");
      if (scene.videoPosterUrl && !isSafeMediaUrl(scene.videoPosterUrl)) throw new Error("Video poster must be an approved media URL.");
      if (scene.audioData && (!/^data:audio\/(mpeg|mp3|wav|x-wav|wave|aac|ogg|webm|mp4|x-m4a);base64,[a-zA-Z0-9+/=]+$/.test(scene.audioData) || scene.audioData.length > 5_500_000)) throw new Error("Use an audio clip under 4 MB.");
      return {
        id: String(scene.id).slice(0, 100), heading: String(scene.heading ?? "").slice(0, 100),
        caption: scene.caption.slice(0, 180), narration: scene.narration.slice(0, 450),
        visualPrompt: scene.visualPrompt.slice(0, 1000),
        palette: ["meadow", "ocean", "space", "forest", "sunset", "night", "candy"].includes(scene.palette) ? scene.palette : "meadow" as const,
        character: ["fox", "bunny", "bear", "turtle", "dino", "cat", "astronaut"].includes(scene.character) ? scene.character : "fox" as const,
        prop: ["butterfly", "star", "flower", "balloon", "book", "rocket", "shell", "none"].includes(scene.prop) ? scene.prop : "star" as const,
        duration: Math.round(durations[index] * 10) / 10,
        motion: allowedMotion.includes(scene.motion ?? "") ? scene.motion : defaults.motion,
        camera: allowedCamera.includes(scene.camera ?? "") ? scene.camera : defaults.camera,
        transition: allowedTransition.includes(scene.transition ?? "") ? scene.transition : defaults.transition,
        expression: allowedExpression.includes(scene.expression ?? "") ? scene.expression : defaults.expression,
        showCharacter: scene.showCharacter !== false,
        ...(scene.artUrl ? { artUrl: scene.artUrl } : {}),
        ...(scene.videoUrl ? { videoUrl: scene.videoUrl } : {}),
        ...(scene.videoPosterUrl ? { videoPosterUrl: scene.videoPosterUrl } : {}),
        ...(typeof scene.sourceName === "string" && scene.sourceName.trim() ? { sourceName: scene.sourceName.slice(0, 40) } : {}),
        ...(typeof scene.sourceUrl === "string" && /^https:\/\//.test(scene.sourceUrl) ? { sourceUrl: scene.sourceUrl.slice(0, 700) } : {}),
        ...(typeof scene.sourceCredit === "string" && scene.sourceCredit.trim() ? { sourceCredit: scene.sourceCredit.slice(0, 180) } : {}),
        ...(scene.audioData ? { audioData: scene.audioData } : {}),
        ...(scene.audioSource && ["generated", "uploaded", "recorded"].includes(scene.audioSource) ? { audioSource: scene.audioSource } : {}),
      };
    });
    const [row] = await db.update(projects).set({
      title: body.title.trim(),
      idea: typeof body.idea === "string" ? body.idea.slice(0, 500) : "",
      category: typeof body.category === "string" ? body.category.slice(0, 50) : "Adventure",
      ageGroup: typeof body.ageGroup === "string" ? body.ageGroup.slice(0, 30) : "3–5 years",
      duration: Math.round(totalDuration),
      style: typeof body.style === "string" ? body.style.slice(0, 50) : "Storybook",
      character: typeof body.character === "string" ? body.character.slice(0, 30) : "fox",
      scenes: normalizedScenes,
      editSettings: normalizeEditorSettings(body.editSettings),
      status: body.status,
      youtubeTitle: typeof body.youtubeTitle === "string" ? body.youtubeTitle.slice(0, 100) : body.title.slice(0, 100),
      description: typeof body.description === "string" ? body.description.slice(0, 5000) : "",
      tags: Array.isArray(body.tags) ? body.tags.filter((tag: unknown) => typeof tag === "string").slice(0, 20).map((tag: string) => tag.slice(0, 50)) : [],
      privacy: body.privacy,
      updatedAt: new Date(),
    }).where(eq(projects.id, id)).returning();
    if (!row) return Response.json({ error: "Project not found." }, { status: 404 });
    return Response.json({ project: serializeProject(row) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save this project." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  const [row] = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
  if (!row) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json({ ok: true });
}
