import { db } from "@/db";
import { projects } from "@/db/schema";
import Studio from "@/components/Studio";
import { getAuthState } from "@/lib/auth";
import { serializeProject } from "@/lib/projects";
import { SAMPLE_PROJECTS } from "@/lib/types";
import { getStudioConfig } from "@/lib/youtube";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const mode = await getAuthState();
  const rows = mode === "authenticated" ? await db.select().from(projects).orderBy(desc(projects.updatedAt)) : [];
  const initialProjects = mode === "authenticated" ? rows.map(serializeProject) : mode === "setup" ? SAMPLE_PROJECTS : [];
  const config = mode === "authenticated" ? await getStudioConfig() : {
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    pollinationsConfigured: Boolean(process.env.POLLINATIONS_API_KEY),
    elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    pexelsConfigured: Boolean(process.env.PEXELS_API_KEY),
    pixabayConfigured: Boolean(process.env.PIXABAY_API_KEY),
    youtubeConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    youtubeConnected: false,
    youtubeChannelTitle: null,
    youtubeChannelAvatar: null,
  };
  return <Studio initialProjects={initialProjects} initialAuth={mode} initialConfig={config} />;
}
