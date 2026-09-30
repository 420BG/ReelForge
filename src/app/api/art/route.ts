import { db } from "@/db";
import { projects } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { serializeProject } from "@/lib/projects";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return Response.json({ error: "Add POLLINATIONS_API_KEY to your server environment to generate AI artwork. The built-in animated cartoons work without it." }, { status: 400 });
  try {
    const { projectId, sceneId } = await request.json();
    if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("Invalid project.");
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    const scene = project.scenes.find((item) => item.id === sceneId);
    if (!scene) return Response.json({ error: "Scene not found." }, { status: 404 });
    const prompt = `Background environment ONLY for this children's cartoon scene: ${scene.visualPrompt}. Show the setting and props, but NO characters, NO animals, NO people and NO faces; the animated main character is composited in front later. Original soft tactile picture-book artwork, layered depth, vibrant pastel color, uncluttered central space, vertical 9:16 composition, no text or logos.`;
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=flux&width=768&height=1365&seed=${Math.floor(Math.random() * 1000000)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(100000), cache: "no-store" });
    if (!response.ok) throw new Error(`Artwork provider returned ${response.status}. Check your key and available free credits.`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) throw new Error("The artwork provider did not return an image.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 6_000_000) throw new Error("The generated image was too large to save.");
    const artUrl = `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`;
    const [updated] = await db.update(projects).set({ scenes: project.scenes.map((item) => item.id === sceneId ? { ...item, artUrl } : item), updatedAt: new Date() }).where(eq(projects.id, projectId)).returning();
    return Response.json({ project: serializeProject(updated) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Artwork generation failed." }, { status: 500 });
  }
}
