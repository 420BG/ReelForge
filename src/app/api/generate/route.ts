import { db } from "@/db";
import { projects } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { serializeProject } from "@/lib/projects";
import { categoryThumbnail, createAiStory, createOfflineStory, type StoryInput } from "@/lib/story";
import { sceneDefaults } from "@/lib/timeline";
import { CATEGORIES, CHARACTERS, type Character } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio first." }, { status: 401 });
  try {
    const body = await request.json();
    const idea = typeof body.idea === "string" ? body.idea.trim() : "";
    if (idea.length < 5 || idea.length > 350) return Response.json({ error: "Write an idea between 5 and 350 characters." }, { status: 400 });
    const input: StoryInput = {
      idea,
      category: CATEGORIES.includes(body.category) ? body.category : "Adventure",
      ageGroup: ["2–4 years", "3–5 years", "5–7 years", "7–9 years"].includes(body.ageGroup) ? body.ageGroup : "3–5 years",
      duration: [15, 20, 30, 45].includes(Number(body.duration)) ? Number(body.duration) : 30,
      style: ["Storybook", "Claymation", "Colorful flat", "Dreamy pastel"].includes(body.style) ? body.style : "Storybook",
      character: CHARACTERS.some((c) => c.value === body.character) ? body.character as Character : "fox",
    };
    let story;
    let mode: "ai" | "offline" = "offline";
    let note: string | null = null;
    if (process.env.OPENROUTER_API_KEY) {
      try {
        story = await createAiStory(input);
        mode = "ai";
      } catch {
        story = createOfflineStory(input);
        note = "The free AI model was unavailable, so we used the built-in story maker instead. You can edit every scene.";
      }
    } else {
      story = createOfflineStory(input);
      note = "Made with the built-in story maker. Add an OpenRouter key in your server environment to use free AI models.";
    }
    const [row] = await db.insert(projects).values({
      title: story.title,
      idea: input.idea,
      category: input.category,
      ageGroup: input.ageGroup,
      duration: input.duration,
      style: input.style,
      character: input.character,
      scenes: story.scenes.map((scene, index) => ({ ...sceneDefaults(index), ...scene, duration: input.duration / story.scenes.length })),
      status: "draft",
      thumbnail: categoryThumbnail(input.category),
      youtubeTitle: story.youtubeTitle,
      description: story.description,
      tags: story.tags,
      privacy: "private",
    }).returning();
    return Response.json({ project: serializeProject(row), mode, note }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't make a story right now." }, { status: 400 });
  }
}
