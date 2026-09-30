import { db } from "@/db";
import { projects } from "@/db/schema";
import { clearSession, getAuthState, registerOwner, signInOwner } from "@/lib/auth";
import { projectInsertFromSample, serializeProject } from "@/lib/projects";
import { SAMPLE_PROJECTS } from "@/lib/types";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const mode = await getAuthState();
  return Response.json({ mode });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action;
    if (action === "logout") {
      await clearSession();
      return Response.json({ mode: "locked" });
    }
    if (typeof body?.pin !== "string") return Response.json({ error: "Enter your PIN or passphrase." }, { status: 400 });
    if (action === "setup") {
      await registerOwner(body.pin);
      await db.insert(projects).values(SAMPLE_PROJECTS.map(projectInsertFromSample)).onConflictDoNothing();
    } else if (action === "login") {
      await signInOwner(body.pin);
    } else {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
    return Response.json({ mode: "authenticated", projects: rows.map(serializeProject) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Something went wrong. Please try again." }, { status: 400 });
  }
}
