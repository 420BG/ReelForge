import { db } from "@/db";
import { projects } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { serializeProject } from "@/lib/projects";
import { uploadMetadata, uploadVideoBuffer } from "@/lib/youtube-upload";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  try {
    const form = await request.formData();
    const projectId = form.get("projectId");
    const file = form.get("video");
    if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) return Response.json({ error: "Invalid project." }, { status: 400 });
    if (!(file instanceof File) || !file.type.startsWith("video/") || file.size < 1000 || file.size > 80_000_000) {
      return Response.json({ error: "Please render a video under 80 MB before uploading." }, { status: 400 });
    }
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    const studioProject = serializeProject(project);
    const videoId = await uploadVideoBuffer(Buffer.from(await file.arrayBuffer()), uploadMetadata(studioProject));
    const [updated] = await db.update(projects).set({ status: "published", youtubeVideoId: videoId, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning();
    return Response.json({ project: serializeProject(updated), url: `https://www.youtube.com/watch?v=${videoId}` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not upload to YouTube. Please try again." }, { status: 500 });
  }
}
