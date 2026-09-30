import { db } from "@/db";
import { projects } from "@/db/schema";
import { AI_VIDEO_PROVIDERS, childSafeVideoPrompt, getDailyTopic, mediaToProxyUrl } from "@/lib/discovery";
import { assembleDailyProject } from "@/lib/automation";
import { serializeProject } from "@/lib/projects";
import { searchStock } from "@/lib/stock";
import { categoryThumbnail, createAiStory, createOfflineStory, type StoryInput } from "@/lib/story";
import { normalizeEditorSettings, sceneDefaults } from "@/lib/timeline";
import { CATEGORIES, CHARACTERS, type Character, type MediaAsset, type StudioProject } from "@/lib/types";
import { desc } from "drizzle-orm";

export type ChatCard =
  | { kind: "project"; projectId: string; title: string; status: string; note?: string; project?: StudioProject }
  | { kind: "assets"; assets: MediaAsset[]; note?: string }
  | { kind: "providers"; providers: { name: string; url: string; freePattern: string; access: string }[]; note?: string }
  | { kind: "projects"; items: { id: string; title: string; status: string; category: string; duration: number }[] };

export type ChatReply = { reply: string; card?: ChatCard; usedModel: "openrouter" | "pollinations" | "local" };

export type ChatTurn = { role: "user" | "assistant"; content: string };

type ToolName = "generate_video" | "generate_story" | "build_daily" | "search_videos" | "generate_ai_clip" | "research_providers" | "list_projects" | "explain";

type Plan = { reply?: string; tool?: ToolName; args?: Record<string, unknown> };

const TOOLS: Record<ToolName, { description: string; args: string }> = {
  generate_video: { description: "Generate a video project from a prompt (AI clip when connected, unlimited built-in render otherwise); it opens in the editor below", args: '{"prompt":"what the video should show"}' },
  generate_story: { description: "Create a new editable kids cartoon storyboard project", args: '{"idea":"required, short story idea","category":"Adventure|Animals|Learning|Bedtime|Ocean|Space|Kindness|Dinosaurs","character":"fox|bunny|bear|turtle|dino|cat|astronaut"}' },
  build_daily: { description: "Auto-build today's kids Short (script + licensed clips when available)", args: '{"topic":"optional daily topic phrase"}' },
  search_videos: { description: "Browse royalty-free stock videos inside the studio", args: '{"query":"2-4 words like baby animals ocean","source":"pexels|pixabay"}' },
  generate_ai_clip: { description: "Generate a short vertical AI video clip (needs Pollinations key, can take minutes)", args: '{"prompt":"scene description"}' },
  research_providers: { description: "List researched free AI video generator providers with real limits and rights notes", args: "{}" },
  list_projects: { description: "List the owner's saved studio projects", args: "{}" },
  explain: { description: "Answer a question about voice, YouTube, licensing, keys, or account policies", args: '{"topic":"voice|youtube|licensing|accounts|arena|keys"}' },
};

const SYSTEM_PROMPT = `You are Littleloop, the cheerful built-in assistant inside Littleloop Studio, a private app that makes original kids' cartoon Shorts (voice, captions, music, auto-editing, and YouTube upload).
Work only inside this app: you can create stories, auto-build today's Short, browse licensed stock video, generate an AI clip, research free providers, list projects, or explain setup.
Always return ONLY valid JSON: {"reply":"your short friendly reply","tool":null or "tool_name","args":{}} using these tools: ${Object.entries(TOOLS).map(([name, tool]) => `${name}(${tool.args})`).join("; ")}.
Rules: be warm, concise and kid-safe; never invent unlimited accounts; never ask for personal info; explain honestly that free tiers have limits and that fake/disposable email accounts to bypass limits are not supported here; Arena is a model-comparison site, not a video API.`;

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

async function callModel(provider: "openrouter" | "pollinations", history: ChatTurn[]): Promise<Record<string, unknown> | null> {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history.slice(-10), ];
  const url = provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://gen.pollinations.ai/v1/chat/completions";
  const key = provider === "openrouter" ? process.env.OPENROUTER_API_KEY : process.env.POLLINATIONS_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Littleloop Assistant" },
      body: JSON.stringify({
        model: provider === "openrouter" ? "openrouter/free" : "openai",
        temperature: 0.5,
        max_tokens: 700,
        messages,
      }),
      signal: AbortSignal.timeout(provider === "openrouter" ? 25000 : 30000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" ? extractJson(content) : null;
  } catch {
    return null;
  }
}

function planFromModel(data: Record<string, unknown> | null): Plan | null {
  if (!data) return null;
  const tool = typeof data.tool === "string" && data.tool in TOOLS ? data.tool as ToolName : undefined;
  const reply = typeof data.reply === "string" ? data.reply.trim().slice(0, 1400) : "";
  if (!tool && !reply) return null;
  return { reply: reply || undefined, tool, args: typeof data.args === "object" && data.args ? data.args as Record<string, unknown> : {} };
}

function localPlan(history: ChatTurn[], message: string): Plan {
  const text = message.toLowerCase();
  const hasKey = Boolean(process.env.OPENROUTER_API_KEY || process.env.POLLINATIONS_API_KEY);

  if (/^(hi|hello|hey|yo|good (morning|evening))\b/.test(text)) {
    return { reply: "Hello! I'm Littleloop. I can make a story, auto-build today's Short, browse free stock clips, research real free AI video generators, or answer setup questions. What shall we make?" };
  }
  if (/(mail|email|disposable|throwaway|unlimited|bypass|as many accounts|fake account)/.test(text)) return { tool: "explain", args: { topic: "accounts" } };
  if (/(daily|today|auto.?build|automatic|routine)/.test(text)) return { tool: "build_daily", args: {} };
  if (/(ai video|text to video|video for me|generate for me|generate a video|make (me )?a video|create a video|render (me )?a video|video of .+|generate video)/.test(text)) {
    return { tool: "generate_video", args: { prompt: message.replace(/^(please\s+)?(generate|make|create|render)( me)?( an?)?( ai)?\s*video\s*(for me)?\s*(about|of|on|:)?\s*/i, "").trim() || message.trim() } };
  }
  if (/(find|search|browse|footage|stock|clip)/.test(text) && /(video|clip|footage|animals?|turtle|ocean|fish|flower|stars?|bunny|fox|dog|cat|forest)/.test(text)) {
    const query = message.replace(/^(find|search for|search|browse|get)\s+/i, "").replace(/\b(videos?|clips?|footage)\b/gi, "").trim();
    return { tool: "search_videos", args: { query: query.length >= 2 ? query : getDailyTopic().query, source: /pixabay/i.test(text) ? "pixabay" : "pexels" } };
  }
  if (/(make|create|build|generate|story|storyboard|cartoon about|video about)/.test(text) && text.length > 10) {
    const idea = message.replace(/^(please\s+)?(make|create|build|generate)( a)?\s+(me )?(a )?(new )?/i, "").trim() || message.trim();
    return { tool: "generate_story", args: { idea, category: CATEGORIES.find((category) => text.includes(category.toLowerCase())) || "Adventure", character: CHARACTERS.find((item) => text.includes(item.label.toLowerCase()) || text.includes(item.value))?.value || "fox" } };
  }
  if (/(ai clip|generate a clip|text to video|make an ai video)/.test(text)) return { tool: "generate_ai_clip", args: { prompt: message.slice(0, 600) } };
  if (/(provider|free ai|video generator|kling|pika|runway|veo|luma|hailuo|seedance|arena)/.test(text)) return { tool: "research_providers", args: {} };
  if (/(voice|narration|text.?to.?speech|speak)/.test(text)) return { tool: "explain", args: { topic: "voice" } };
  if (/(youtube|upload|publish|post it)/.test(text)) return { tool: "explain", args: { topic: "youtube" } };
  if (/(license|copyright|commercial|monetize|attribution)/.test(text)) return { tool: "explain", args: { topic: "licensing" } };
  if (/(api key|settings|configure|pexels|pixabay|openrouter|elevenlabs)/.test(text)) return { tool: "explain", args: { topic: "keys" } };
  if (/(my projects?|list|saved|what have i made)/.test(text)) return { tool: "list_projects", args: {} };
  return {
    reply: hasKey
      ? "I'm a little lost — could you try one of these: “build today's video”, “find videos of baby animals”, “make a story about a shy turtle”, or “which free AI video generators are real?”"
      : "I'm running in built-in mode (no AI key yet), but I can still work: “build today's video”, “find videos of baby animals”, “make a story about a shy turtle”, “list my projects”, or “which free AI generators are real?”. Add OPENROUTER_API_KEY to make me smarter.",
  };
}

async function insertProject(assembled: StudioProject) {
  const [row] = await db.insert(projects).values({
    title: assembled.title,
    idea: assembled.idea,
    category: assembled.category,
    ageGroup: assembled.ageGroup,
    duration: assembled.duration,
    style: assembled.style,
    character: assembled.character,
    scenes: assembled.scenes.map((scene) => ({ ...scene, videoUrl: scene.videoUrl ? mediaToProxyUrl(scene.videoUrl) : scene.videoUrl, videoPosterUrl: scene.videoPosterUrl ? mediaToProxyUrl(scene.videoPosterUrl) : scene.videoPosterUrl })),
    editSettings: normalizeEditorSettings(assembled.editSettings),
    status: "draft",
    thumbnail: assembled.thumbnail,
    youtubeTitle: assembled.youtubeTitle,
    description: assembled.description,
    tags: assembled.tags,
    privacy: "private",
  }).returning();
  return serializeProject(row);
}

function string(value: unknown, max = 300, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

async function generateClip(prompt: string): Promise<ChatReply> {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) {
    return { reply: "Direct AI clip generation needs POLLINATIONS_API_KEY on the server. For unlimited, free generation without keys, use my built-in storyteller: say “make a story about …” and I'll render animated cartoon frames locally. Free web generators (Kling, Flow/Veo, Pika, Luma) remain available in the Auto Hub, each with its own limits.", usedModel: "local" };
  }
  const safePrompt = childSafeVideoPrompt(prompt);
  const url = `https://gen.pollinations.ai/video/${encodeURIComponent(safePrompt)}?duration=5&aspectRatio=9%3A16`;
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(170000), cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.startsWith("video/")) {
      await response.body?.cancel();
      return { reply: `The video provider returned ${response.status}. That model may need Pollen credits — check the Auto Hub provider cards for the current limits, or say “make a story” for key-free local animation.`, usedModel: "pollinations" };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 12_000_000) return { reply: "That clip came back larger than 12 MB, so it can't be saved into a project. Use a free web generator from the Auto Hub instead.", usedModel: "pollinations" };
    const asset: MediaAsset = {
      id: `pollinations-${Date.now()}`,
      source: "pollinations",
      title: safePrompt.slice(0, 90),
      author: "Pollinations generated clip",
      pageUrl: "https://pollinations.ai/play",
      downloadUrl: `data:${contentType.split(";")[0] || "video/mp4"};base64,${bytes.toString("base64")}`,
      duration: 5,
      tags: ["AI video", "kids cartoon", "vertical short"],
      licenseNote: "AI-generated clip. Review provider rights and provenance before publishing.",
      aiGenerated: true,
    };
    return { reply: "Your 5-second vertical AI clip is ready — I've attached it here. You can download it now, or use “build today's video” and I'll auto-edit clips with captions, music and credits.", card: { kind: "assets", assets: [asset], note: "AI-generated · review rights before monetizing." }, usedModel: "pollinations" };
  } catch {
    return { reply: "The AI clip request timed out (these models often take minutes). Try again in a moment, or use “make a story” which is instant and key-free.", usedModel: "pollinations" };
  }
}

async function executeTool(tool: ToolName, args: Record<string, unknown>, usedModel: ChatReply["usedModel"]): Promise<ChatReply> {
  switch (tool) {
    case "generate_video": {
      const topic = getDailyTopic();
      const rawPrompt = string(args.prompt, 600, topic.title).trim();
      const prompt = /^(now|please|today|a video|an ai video|video|me|for me|for me now)\.?$/i.test(rawPrompt) ? topic.title : rawPrompt;
      const assembled = assembleDailyProject([], {
        title: prompt.replace(/[.!?]+$/, "").slice(0, 90) || topic.title,
        idea: `${prompt}. A gentle, playful preschool story with a happy ending.`,
        category: topic.category,
        ageGroup: "3–5 years",
        duration: 42,
        character: "fox",
      });
      let generationNote = "The built-in generator is unlimited and key-free: press Export in the editor below to render an actual video file right now.";
      const apiKey = process.env.POLLINATIONS_API_KEY;
      if (apiKey) {
        try {
          const safePrompt = childSafeVideoPrompt(prompt);
          const response = await fetch(`https://gen.pollinations.ai/video/${encodeURIComponent(safePrompt)}?duration=5&aspectRatio=9%3A16`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(170000),
            cache: "no-store",
          });
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && contentType.startsWith("video/")) {
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length <= 12_000_000) {
              assembled.scenes[0] = {
                ...assembled.scenes[0],
                videoUrl: `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`,
                artUrl: undefined,
                showCharacter: false,
                sourceName: "pollinations",
                sourceCredit: "Pollinations AI clip",
                sourceUrl: "https://pollinations.ai/play",
              };
              generationNote = "I generated a real 5-second AI clip for scene 1; the remaining scenes continue the story. Press Export below for the finished video file.";
            }
          } else {
            await response.body?.cancel();
            generationNote = `The AI video model returned ${response.status} (it may need Pollen credits). The unlimited built-in generator is loaded instead — press Export below for a real video file.`;
          }
        } catch {
          generationNote = "The AI video model timed out (these can take minutes), so I loaded the unlimited built-in generator instead — press Export below for a real video file.";
        }
      }
      const project = await insertProject(assembled);
      return { reply: `Your video project “${project.title}” is ready — ${project.scenes.length} scenes, ${project.duration}s vertical. It's loaded in the editor right below this chat. ${generationNote}`, card: { kind: "project", projectId: project.id, title: project.title, status: project.status, project }, usedModel };
    }
    case "generate_story": {
      const idea = string(args.idea, 350);
      if (idea.length < 5) return { reply: "Tell me a little more about the story — one sentence is enough!", usedModel };
      const input: StoryInput = {
        idea,
        category: CATEGORIES.includes(string(args.category, 50, "Adventure")) ? string(args.category, 50, "Adventure") : "Adventure",
        ageGroup: "3–5 years",
        duration: 30,
        style: "Storybook",
        character: CHARACTERS.some((item) => item.value === args.character) ? args.character as Character : "fox",
      };
      let story = createOfflineStory(input);
      if (process.env.OPENROUTER_API_KEY) { try { story = await createAiStory(input); } catch { /* keep built-in */ } }
      const project = await insertProject({
        ...story,
        id: "",
        idea: input.idea,
        category: input.category,
        ageGroup: input.ageGroup,
        duration: input.duration,
        style: input.style,
        character: input.character,
        status: "draft",
        thumbnail: categoryThumbnail(input.category),
        privacy: "private",
        youtubeVideoId: null,
        createdAt: "",
        updatedAt: "",
      } as StudioProject);
      return { reply: `I created “${project.title}” as a draft — ${project.scenes.length} animated scenes with captions, timing and music ready to edit.`, card: { kind: "project", projectId: project.id, title: project.title, status: project.status, project }, usedModel };
    }
    case "build_daily": {
      const topic = getDailyTopic();
      const source: "pexels" | "pixabay" = process.env.PEXELS_API_KEY ? "pexels" : "pixabay";
      let assets: MediaAsset[] = [];
      let clipNote = "I'll build it from the original cartoon renderer.";
      if (process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY) {
        const result = await searchStock(source, string(args.topic, 100, topic.query));
        assets = result.assets.slice(0, 5).map((asset) => ({ ...asset, downloadUrl: mediaToProxyUrl(asset.downloadUrl), posterUrl: asset.posterUrl ? mediaToProxyUrl(asset.posterUrl) : undefined }));
        clipNote = assets.length ? `I auto-edited ${assets.length} licensed clip${assets.length > 1 ? "s" : ""} from ${source}.` : "No safe clips matched, so I'll build it from the original cartoon renderer.";
      }
      const project = await insertProject(assembleDailyProject(assets, { title: string(args.topic, 100, topic.title), idea: `${topic.title}: a gentle preschool story about ${topic.lesson}.`, category: topic.category, ageGroup: "3–5 years", duration: 42, character: "fox" }));
      return { reply: `Today's Short is built: “${project.title}” (${project.scenes.length} scenes, ${project.duration}s). ${clipNote} Next: review the Text tab, add voices, preview, then export or publish.`, card: { kind: "project", projectId: project.id, title: project.title, status: project.status, project }, usedModel };
    }
    case "search_videos": {
      const query = string(args.query, 100, getDailyTopic().query);
      const source: "pexels" | "pixabay" = args.source === "pixabay" && process.env.PIXABAY_API_KEY ? "pixabay" : "pexels";
      const result = await searchStock(source, query);
      if (!result.assets.length) return { reply: result.message || `No safe clips found for “${query}”. Try a simpler word like animals, ocean, flowers or stars.`, usedModel };
      const assets = result.assets.slice(0, 8).map((asset) => ({ ...asset, downloadUrl: mediaToProxyUrl(asset.downloadUrl), posterUrl: asset.posterUrl ? mediaToProxyUrl(asset.posterUrl) : undefined }));
      return { reply: `Here are ${assets.length} free ${source} clips for “${query}”. Preview them here, download through the app, or open the Auto Hub to select clips and auto-edit them.`, card: { kind: "assets", assets, note: `${source === "pexels" ? "Pexels License" : "Pixabay Content License"} · creator credit shown · source page linked.` }, usedModel };
    }
    case "generate_ai_clip": return generateClip(string(args.prompt, 700, getDailyTopic().title));
    case "research_providers": {
      const cards = AI_VIDEO_PROVIDERS.map((provider) => ({ name: provider.name, url: provider.url, freePattern: provider.freePattern, access: provider.access }));
      return { reply: "I researched the current landscape. Honest answer: there is no truly unlimited free hosted video API — free tiers change and monetized uploads need commercial rights. Pollinations can generate in-app (key + credits), Pixazo/LTX offers a free API tier, and Flow/Veo, Kling, Pika, Hailuo, Luma, Runway and CapCut are free-at-entry web apps whose limits and watermarks you should check each day. Arena is a model-comparison site, not a video API. For unlimited volume without limits, my built-in renderer is key-free. Full details below.", card: { kind: "providers", providers: cards }, usedModel };
    }
    case "list_projects": {
      const rows = await db.select({ id: projects.id, title: projects.title, status: projects.status, category: projects.category, duration: projects.duration }).from(projects).orderBy(desc(projects.updatedAt)).limit(8);
      return rows.length
        ? { reply: `You have ${rows.length} recent project${rows.length > 1 ? "s" : ""} — open any of them below.`, card: { kind: "projects", items: rows.map((row) => ({ ...row, status: row.status as string })) }, usedModel }
        : { reply: "You don't have any projects yet. Say “build today's video” or “make a story about …” and I'll create your first one.", usedModel };
    }
    case "explain": {
      const topic = string(args.topic, 40, "keys");
      const explanations: Record<string, string> = {
        voice: "Voice options: 1) record your own microphone or import an audio file — free, saved with the project, and included in exports; 2) generate Kokoro voices with POLLINATIONS_API_KEY; 3) ElevenLabs lifelike voices with ELEVENLABS_API_KEY (free tier is personal/non-commercial — monetized channels need a commercial plan). Browser speech preview is NOT captured in exports.",
        youtube: "To upload: Google Cloud → enable YouTube Data API v3 → create a Web OAuth client with redirect URI /api/youtube/callback → add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server settings → Settings → Connect YouTube. Uploads are private by default and marked made-for-kids; you review and approve every upload.",
        licensing: "Stock clips: Pexels License and Pixabay Content License allow free commercial use; I always show creator credit and the source page, and Pixabay asks that you show where results came from. AI clips: check the specific model's commercial rights before monetizing. Never use other creators' videos.",
        accounts: "I don't create random or disposable email accounts — that breaks those platforms' terms of service, can get their free limits revoked, and risks your channel. Unlimited here comes from what's legitimately unlimited: my built-in storyboard and video renderer (no quota), your own connected keys, and your own recordings. Free web tiers stay within their published limits and you switch accounts yourself if you have a second legitimate login.",
        arena: "Arena (arena.ai / lmarena) is a model-comparison and chat platform, not a public text-to-video API — that's why there's no official “Arena video generator” to connect. This studio uses real APIs (Pollinations, Pexels, Pixabay) plus free web generators that you open and download from.",
        keys: "Keys live only in server settings (never in the browser): OPENROUTER_API_KEY (free-model story writing), PEXELS_API_KEY + PIXABAY_API_KEY (free stock browsing), POLLINATIONS_API_KEY (art, AI clips, Kokoro voices), ELEVENLABS_API_KEY (lifelike voices), GOOGLE_CLIENT_ID/SECRET (YouTube). Everything else — storyboard, animation, captions, music, recording, rendering, export — works with no key at all.",
      };
      return { reply: explanations[topic] || explanations.keys, usedModel };
    }
  }
}

export async function runAssistant(history: ChatTurn[], userMessage: string): Promise<ChatReply> {
  const trimmed = history.slice(-10).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 1200) } as ChatTurn));
  const turns: ChatTurn[] = [...trimmed, { role: "user", content: userMessage.slice(0, 1200) }];

  const openRouterPlan = process.env.OPENROUTER_API_KEY ? planFromModel(await callModel("openrouter", turns)) : null;
  const plan = openRouterPlan
    || (process.env.POLLINATIONS_API_KEY ? planFromModel(await callModel("pollinations", turns)) : null)
    || localPlan(turns, userMessage);

  const usedModel: ChatReply["usedModel"] = process.env.OPENROUTER_API_KEY && openRouterPlan ? "openrouter" : plan ? (process.env.POLLINATIONS_API_KEY && !openRouterPlan && plan.reply ? "pollinations" : "local") : "local";

  if (plan.tool && plan.tool in TOOLS) {
    try {
      return await executeTool(plan.tool, plan.args || {}, usedModel);
    } catch (error) {
      return { reply: error instanceof Error ? error.message : "That action failed. Try again or use another tab.", usedModel };
    }
  }
  return { reply: plan.reply || localPlan(turns, userMessage).reply || "Tell me what to make.", usedModel };
}
