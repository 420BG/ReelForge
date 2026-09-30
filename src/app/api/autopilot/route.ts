import { db } from "@/db";
import { projects } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { listPendingRenders, runAutopilotIfDue } from "@/lib/autopilot";
import { getAutoSettings } from "@/lib/keys";
import { serializeProject } from "@/lib/projects";
import { deleteRender, hasRender, readRender, saveRender } from "@/lib/storage";
import { getIntegration } from "@/lib/youtube";
import { uploadMetadata, uploadVideoBuffer } from "@/lib/youtube-upload";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  try {
    const run = await runAutopilotIfDue();
    const integration = await getIntegration();
    return Response.json({
      auto: await getAutoSettings(),
      pending: await listPendingRenders(),
      youtubeConnected: Boolean(integration?.youtubeRefreshToken),
      youtubeChannelTitle: integration?.youtubeChannelTitle || null,
      lastRun: run,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Autopilot failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const projectId = form.get("projectId");
      const video = form.get("video");
      if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) return Response.json({ error: "Invalid project." }, { status: 400 });
      if (!(video instanceof File) || !video.type.startsWith("video/") || video.size < 1000 || video.size > 80_000_000) {
        return Response.json({ error: "Send a rendered WebM between 1 KB and 80 MB." }, { status: 400 });
      }
      await saveRender(projectId, Buffer.from(await video.arrayBuffer()));
      return Response.json({ ok: true, projectId, stored: true });
    }

    const body = await request.json().catch(() => ({}));
    if (body.action !== "publish") return Response.json({ error: "Unknown autopilot action." }, { status: 400 });
    const projectId = String(body.projectId || "");
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) return Response.json({ error: "Invalid project." }, { status: 400 });
    const auto = await getAutoSettings();
    if (!auto.autoPost) return Response.json({ error: "Turn on auto-post in Settings → Daily autopilot first." }, { status: 400 });
    const integration = await getIntegration();
    if (!integration?.youtubeRefreshToken) return Response.json({ error: "Connect your YouTube channel in Settings first." }, { status: 400 });
    if (!(await hasRender(projectId))) return Response.json({ error: "Render today's video before posting it." }, { status: 400 });
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    const bytes = await readRender(projectId);
    if (!bytes) return Response.json({ error: "The rendered video file is missing." }, { status: 404 });

    const studioProject = serializeProject(project);
    const videoId = await uploadVideoBuffer(bytes, uploadMetadata(studioProject, auto.visibility));
    await db.update(projects).set({ status: "published", youtubeVideoId: videoId, updatedAt: new Date() }).where(eq(projects.id, projectId));
    await deleteRender(projectId);
    return Response.json({ ok: true, url: `https://www.youtube.com/watch?v=${videoId}`, videoId, privacy: auto.visibility });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Autopilot publish failed." }, { status: 500 });
  }
}
