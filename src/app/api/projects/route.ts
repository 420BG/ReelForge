import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { serializeProject } from "@/lib/projects";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  return Response.json({ projects: rows.map(serializeProject) });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio." }, { status: 401 });
  try {
    const { sourceId } = await request.json();
    if (typeof sourceId !== "string") return Response.json({ error: "Choose a project to duplicate." }, { status: 400 });
    const [source] = await db.select().from(projects).where(eq(projects.id, sourceId)).limit(1);
    if (!source) return Response.json({ error: "Project not found." }, { status: 404 });
    const [copy] = await db.insert(projects).values({
      title: `${source.title} (copy)`, idea: source.idea, category: source.category, ageGroup: source.ageGroup,
      duration: source.duration, style: source.style, character: source.character,
      scenes: source.scenes.map((scene) => ({ ...scene, id: randomUUID() })),
      editSettings: source.editSettings,
      status: "draft", thumbnail: source.thumbnail, youtubeTitle: source.youtubeTitle,
      description: source.description, tags: source.tags, privacy: "private",
    }).returning();
    return Response.json({ project: serializeProject(copy) }, { status: 201 });
  } catch {
    return Response.json({ error: "Could not duplicate the project." }, { status: 400 });
  }
}
