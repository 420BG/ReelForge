import type { MediaAsset } from "@/lib/types";

export type AiVideoProvider = {
  id: string;
  name: string;
  url: string;
  access: "api" | "web-app" | "self-host";
  freePattern: string;
  bestFor: string;
  exportNote: string;
  commercialNote: string;
  promptHint: string;
};

export const AI_VIDEO_PROVIDERS: AiVideoProvider[] = [
  {
    id: "pollinations",
    name: "Pollinations Video",
    url: "https://pollinations.ai/play",
    access: "api",
    freePattern: "Open-source gateway; free Pollen/quotas may change by account and model.",
    bestFor: "Short 5–10s stylized clips connected directly to this studio.",
    exportNote: "API connector returns MP4 when POLLINATIONS_API_KEY is configured.",
    commercialNote: "Check the selected model and account terms before monetizing.",
    promptHint: "Original cute animated animal story clip, soft pastel 3D, gentle motion, vertical 9:16, no logos or text",
  },
  {
    id: "pixazo",
    name: "Pixazo LTX Video",
    url: "https://www.pixazo.ai/api/free",
    access: "api",
    freePattern: "Free API tier documented with LTX text/image-to-video; account key required.",
    bestFor: "Developers who want a separate REST video API key.",
    exportNote: "Open Pixazo, create a key, then use its LTX endpoint or download MP4 manually.",
    commercialNote: "Verify current LTX/Pixazo commercial rights before publishing.",
    promptHint: "Friendly cartoon fox discovering a glowing flower, slow camera push, warm children's animation, 9:16",
  },
  {
    id: "flow",
    name: "Google Flow / Veo",
    url: "https://labs.google/flow",
    access: "web-app",
    freePattern: "Eligible accounts can receive limited daily Flow credits; availability varies by country.",
    bestFor: "High-quality cinematic AI clips and image-to-video.",
    exportNote: "Create in Flow's logged-in editor, download the MP4, then import it here.",
    commercialNote: "Review Google's generated-content and commercial-use rules.",
    promptHint: "Wholesome children's cartoon, a small bear and butterfly in a sunny meadow, soft lighting, slow happy movement",
  },
  {
    id: "kling",
    name: "Kling AI",
    url: "https://klingai.com/",
    access: "web-app",
    freePattern: "Free daily credits are commonly offered but limits, watermark, and rights vary.",
    bestFor: "Smooth character motion and image-to-video tests.",
    exportNote: "Use the web app queue; download finished clips and add them to the media bin.",
    commercialNote: "Confirm watermark/export and commercial rights for the day's plan.",
    promptHint: "Adorable original bunny character hopping through a storybook forest, expressive eyes, gentle bounce, no text",
  },
  {
    id: "pika",
    name: "Pika",
    url: "https://pika.art/",
    access: "web-app",
    freePattern: "Free account allocations and watermark rules change frequently.",
    bestFor: "Stylized effects, playful motion, and quick social clips.",
    exportNote: "Download from Pika after rendering; use this studio for captions, voice and assembly.",
    commercialNote: "Inspect the export license before using it on a monetized channel.",
    promptHint: "Cute claymation turtle helping a starfish in a colorful tide pool, cozy kids cartoon, smooth slow motion",
  },
  {
    id: "hailuo",
    name: "Hailuo / MiniMax Video",
    url: "https://hailuoai.video/",
    access: "web-app",
    freePattern: "Basic free access and new-user credits are offered in many regions.",
    bestFor: "Fast concept clips and image animation.",
    exportNote: "Queue in the browser, download the MP4, then import into a daily project.",
    commercialNote: "Credits expire and free-license terms can change.",
    promptHint: "Original gentle dinosaur learning to share a colorful berry, preschool animation, soft colors, happy ending",
  },
  {
    id: "luma",
    name: "Luma Dream Machine",
    url: "https://lumalabs.ai/dream-machine",
    access: "web-app",
    freePattern: "Limited monthly generations are commonly available to free accounts.",
    bestFor: "Image-to-video motion and dreamy camera moves.",
    exportNote: "Generate consistent key images first, animate them in Luma, then download and assemble.",
    commercialNote: "Confirm account terms and watermark status on export.",
    promptHint: "Storybook rocket floating to a pastel planet, whimsical children's animation, slow upward camera, no text",
  },
  {
    id: "runway",
    name: "Runway",
    url: "https://runwayml.com/",
    access: "web-app",
    freePattern: "One-time trial credits; not dependable for unlimited daily automation.",
    bestFor: "Polished editing experiments and occasional image-to-video clips.",
    exportNote: "Use Runway credits for hero clips; use stock/original animation for daily volume.",
    commercialNote: "Free plans are usually limited and may include watermark restrictions.",
    promptHint: "Cozy 3D cartoon animal friends waving goodbye at sunset, preschool safe, calm pacing, vertical composition",
  },
  {
    id: "capcut",
    name: "CapCut Desktop/Web",
    url: "https://www.capcut.com/editor",
    access: "web-app",
    freePattern: "Free editing features; platform-specific templates and export rules apply.",
    bestFor: "Manual finishing when a provider clip needs additional effects outside this studio.",
    exportNote: "This studio already renders a Short; CapCut is an optional external finishing route.",
    commercialNote: "Check music, template, and effect licenses for commercial channels.",
    promptHint: "Use after clips are downloaded: vertical 9:16, safe captions, gentle cuts, kids music.",
  },
];

export const DAILY_TOPICS = [
  { title: "Benny’s Big Share", category: "Kindness", query: "cute bear forest animals", lesson: "sharing makes friendships stronger" },
  { title: "Tilly’s Tiny Tide Pool", category: "Ocean", query: "sea turtle fish ocean underwater", lesson: "being gentle helps new friends feel safe" },
  { title: "Dino’s Courage Dance", category: "Dinosaurs", query: "dinosaur toy animation nature", lesson: "trying again is brave" },
  { title: "Cosmo Counts the Stars", category: "Space", query: "stars night sky space cartoon", lesson: "curiosity can turn little questions into big discoveries" },
  { title: "Bunny Listens to the Rain", category: "Bedtime", query: "bunny rain forest calm", lesson: "quiet moments can feel safe and cozy" },
  { title: "Kitty’s Garden Helpers", category: "Learning", query: "butterfly flowers garden bees", lesson: "small helpers make beautiful things grow" },
  { title: "Foxy Finds a New Friend", category: "Animals", query: "fox animals meadow sunrise", lesson: "a kind hello can begin a friendship" },
];

export function getDailyTopic(date = new Date()) {
  const dayNumber = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  return DAILY_TOPICS[dayNumber % DAILY_TOPICS.length];
}

export function childSafeVideoPrompt(base: string) {
  return `${base}, preschool-safe, non-scary, no real children, no brands, no logos, no text, gentle movement, no fast flashing lights, vertical 9:16, high-quality MP4`.slice(0, 900);
}

export function mediaToProxyUrl(url: string, download = false) {
  try {
    const parsed = new URL(url);
    const allowed = ["videos.pexels.com", "images.pexels.com", "cdn.pixabay.com", "pixabay.com", "gen.pollinations.ai", "media.pollinations.ai"];
    const hostAllowed = allowed.includes(parsed.hostname) || parsed.hostname.endsWith(".pollinations.ai") || parsed.hostname.endsWith(".pexels.com");
    if (!hostAllowed) return url;
    return `/api/media/proxy?url=${encodeURIComponent(url)}${download ? "&download=1" : ""}`;
  } catch {
    return url;
  }
}

export function attribution(asset: MediaAsset) {
  return asset.author && asset.author !== "Unknown"
    ? `${asset.source === "pixabay" ? "Pixabay" : asset.source === "pexels" ? "Pexels" : "AI"} · ${asset.author}`
    : asset.source;
}
