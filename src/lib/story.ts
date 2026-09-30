import { randomUUID } from "node:crypto";
import type { CameraMotion, Character, CharacterMotion, Expression, Palette, Prop, SceneTransition, StoryScene } from "@/lib/types";
import { sceneDefaults } from "@/lib/timeline";

export type StoryInput = {
  idea: string;
  category: string;
  ageGroup: string;
  duration: number;
  style: string;
  character: Character;
};

export type GeneratedStory = {
  title: string;
  scenes: StoryScene[];
  youtubeTitle: string;
  description: string;
  tags: string[];
};

const CHAR_NAMES: Record<Character, string> = {
  fox: "Foxy", bunny: "Bunny", bear: "Benny", turtle: "Tilly", dino: "Dino", cat: "Kitty", astronaut: "Cosmo",
};

const CATEGORY_THEMES: Record<string, { palettes: Palette[]; props: Prop[]; moment: string; lesson: string; thumbnail: string }> = {
  Adventure: { palettes: ["meadow", "forest", "sunset", "night", "meadow"], props: ["butterfly", "flower", "star", "star", "balloon"], moment: "a surprising new path", lesson: "every adventure is better with a friend", thumbnail: "/images/thumb-fox.png" },
  Animals: { palettes: ["meadow", "forest", "candy", "sunset", "meadow"], props: ["flower", "butterfly", "balloon", "flower", "star"], moment: "a new animal friend", lesson: "the kindest hello can begin a friendship", thumbnail: "/images/thumb-fox.png" },
  Learning: { palettes: ["meadow", "forest", "sunset", "candy", "meadow"], props: ["book", "flower", "star", "book", "star"], moment: "a curious question", lesson: "little questions lead to big discoveries", thumbnail: "/images/thumb-dino.png" },
  Bedtime: { palettes: ["sunset", "night", "space", "night", "sunset"], props: ["star", "star", "balloon", "star", "star"], moment: "a gentle nighttime surprise", lesson: "there is always a little light in the dark", thumbnail: "/images/thumb-space.png" },
  Ocean: { palettes: ["ocean", "ocean", "ocean", "ocean", "ocean"], props: ["shell", "star", "shell", "star", "shell"], moment: "a secret under the sea", lesson: "the ocean is brighter with a friend", thumbnail: "/images/thumb-ocean.png" },
  Space: { palettes: ["space", "space", "night", "space", "space"], props: ["rocket", "star", "star", "rocket", "star"], moment: "a sparkling new planet", lesson: "curiosity can take us anywhere", thumbnail: "/images/thumb-space.png" },
  Kindness: { palettes: ["meadow", "forest", "sunset", "candy", "meadow"], props: ["flower", "balloon", "star", "flower", "star"], moment: "someone who needed a hand", lesson: "a small act of kindness can make a big difference", thumbnail: "/images/thumb-fox.png" },
  Dinosaurs: { palettes: ["forest", "meadow", "sunset", "candy", "meadow"], props: ["flower", "star", "book", "flower", "star"], moment: "a prehistoric surprise", lesson: "even little dinosaurs can do big things", thumbnail: "/images/thumb-dino.png" },
};

export function categoryThumbnail(category: string) {
  return (CATEGORY_THEMES[category] ?? CATEGORY_THEMES.Adventure).thumbnail;
}

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortTitle(idea: string) {
  const trimmed = idea.replace(/[.!?]+$/, "").trim();
  return titleCase(trimmed.length > 45 ? trimmed.slice(0, 42).trimEnd() + "…" : trimmed);
}

export function createOfflineStory(input: StoryInput): GeneratedStory {
  const theme = CATEGORY_THEMES[input.category] ?? CATEGORY_THEMES.Adventure;
  const name = CHAR_NAMES[input.character];
  const idea = input.idea.replace(/[.!?]+$/, "").trim();
  const title = shortTitle(idea);
  const count = input.duration <= 20 ? 4 : 5;
  const beats = [
    { heading: "Once upon a little time", caption: `${name} had a wonderful idea!`, narration: `One day, ${name} began a new story: ${idea}.` },
    { heading: "What could it be?", caption: "A little surprise was waiting.", narration: `${name} looked around and discovered ${theme.moment}. What an exciting surprise!` },
    { heading: "Let's try together", caption: "A brave little step can go a long way.", narration: `At first, ${name} wasn't sure what to do. Then ${name} took one brave little step.` },
    { heading: "A bright idea", caption: `${name} found a way!`, narration: `With a little patience and a lot of heart, ${name} found a way to make things better.` },
    { heading: "The happiest ending", caption: "Little moments make big memories.", narration: `And that is how ${name} learned that ${theme.lesson}. The end!` },
  ];
  const selected = count === 4 ? [beats[0], beats[1], beats[3], beats[4]] : beats;
  const scenes: StoryScene[] = selected.map((beat, index) => ({
    ...sceneDefaults(index),
    id: randomUUID(),
    heading: beat.heading,
    caption: beat.caption,
    narration: beat.narration,
    visualPrompt: `Original child-friendly ${input.style.toLowerCase()} cartoon, ${name} the friendly ${input.character}, ${beat.heading.toLowerCase()}, ${idea}, ${input.category.toLowerCase()} setting, soft rounded pastel shapes, no words or logos, vertical 9:16 illustration`,
    palette: theme.palettes[Math.min(index, 4)],
    character: input.character,
    prop: theme.props[Math.min(index, 4)],
  }));
  return {
    title,
    scenes,
    youtubeTitle: `${title.slice(0, 74)} | A Little Cartoon Story #Shorts`,
    description: `Come along with ${name} in an original little ${input.category.toLowerCase()} story: ${idea}. A gentle, imaginative cartoon for children.\n\n#Shorts #KidsStories #CartoonForKids`,
    tags: ["kids stories", "cartoon for kids", input.category.toLowerCase(), "shorts", input.character],
  };
}

export async function createAiStory(input: StoryInput): Promise<GeneratedStory> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OpenRouter is not configured");
  const count = input.duration <= 20 ? 4 : 5;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Title": "Littleloop Studio",
    },
    body: JSON.stringify({
      model: "openrouter/free",
      temperature: 0.8,
      max_tokens: 1800,
      messages: [
        { role: "system", content: "You are a thoughtful writer of ORIGINAL short children's cartoons. Return ONLY valid JSON with no markdown. Stories must be warm, upbeat, developmentally appropriate, non-scary, and easy to understand. Never use copyrighted characters, real brands, unsafe activities, personal information requests, or calls to subscribe. Every scene should advance one coherent story. Narration must be short enough to speak in 4–7 seconds. Captions should be short and readable." },
        { role: "user", content: `Create an original ${input.duration}-second vertical cartoon for ages ${input.ageGroup}, category ${input.category}, art style ${input.style}, starring a friendly ${input.character}. Idea: ${input.idea}. Return JSON shaped exactly like {"title":"...","youtubeTitle":"... #Shorts","description":"...","tags":["..."],"scenes":[{"heading":"...","caption":"...","narration":"...","visualPrompt":"...","palette":"meadow|ocean|space|forest|sunset|night|candy","prop":"butterfly|star|flower|balloon|book|rocket|shell|none","motion":"bounce|walk|dance|float|wave","expression":"happy|excited|curious|sleepy|surprised","camera":"push-in|pan-left|pan-right|steady","transition":"fade|slide|pop|cut"}]}. Choose expressive actions that match each story beat; include a mix of camera moves. Return exactly ${count} scenes. Keep captions under 60 characters and narration under 26 words per scene. Visual prompts describe the same ${input.character} in each shot, vertical composition, no lettering.` },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`OpenRouter request failed (${response.status})`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The model returned no story");
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model returned an invalid story");
  const parsed = JSON.parse(content.slice(start, end + 1));
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 3) throw new Error("The model returned too few scenes");
  const fallback = createOfflineStory(input);
  const validPalettes: Palette[] = ["meadow", "ocean", "space", "forest", "sunset", "night", "candy"];
  const validProps: Prop[] = ["butterfly", "star", "flower", "balloon", "book", "rocket", "shell", "none"];
  const validMotions: CharacterMotion[] = ["bounce", "walk", "dance", "float", "wave"];
  const validExpressions: Expression[] = ["happy", "excited", "curious", "sleepy", "surprised"];
  const validCameras: CameraMotion[] = ["push-in", "pan-left", "pan-right", "steady"];
  const validTransitions: SceneTransition[] = ["fade", "slide", "pop", "cut"];
  const scenes: StoryScene[] = parsed.scenes.slice(0, count).map((scene: Record<string, unknown>, index: number) => ({
    ...sceneDefaults(index),
    id: randomUUID(),
    heading: clean(scene.heading, 55) || fallback.scenes[index]?.heading || "A little moment",
    caption: clean(scene.caption, 85) || fallback.scenes[index]?.caption || "The story goes on...",
    narration: clean(scene.narration, 220) || fallback.scenes[index]?.narration || "What a wonderful day!",
    visualPrompt: clean(scene.visualPrompt, 450) || fallback.scenes[index]?.visualPrompt || "Friendly storybook cartoon",
    palette: validPalettes.includes(scene.palette as Palette) ? scene.palette as Palette : fallback.scenes[index]?.palette || "meadow",
    character: input.character,
    prop: validProps.includes(scene.prop as Prop) ? scene.prop as Prop : fallback.scenes[index]?.prop || "star",
    motion: validMotions.includes(scene.motion as CharacterMotion) ? scene.motion as CharacterMotion : sceneDefaults(index).motion,
    expression: validExpressions.includes(scene.expression as Expression) ? scene.expression as Expression : sceneDefaults(index).expression,
    camera: validCameras.includes(scene.camera as CameraMotion) ? scene.camera as CameraMotion : sceneDefaults(index).camera,
    transition: validTransitions.includes(scene.transition as SceneTransition) ? scene.transition as SceneTransition : sceneDefaults(index).transition,
  }));
  return {
    title: clean(parsed.title, 70) || fallback.title,
    youtubeTitle: clean(parsed.youtubeTitle, 95) || fallback.youtubeTitle,
    description: clean(parsed.description, 1500) || fallback.description,
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag: unknown) => typeof tag === "string").slice(0, 8).map((tag: string) => clean(tag, 30)) : fallback.tags,
    scenes,
  };
}
