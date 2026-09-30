export type Character = "fox" | "bunny" | "bear" | "turtle" | "dino" | "cat" | "astronaut";
export type Palette = "meadow" | "ocean" | "space" | "forest" | "sunset" | "night" | "candy";
export type Prop = "butterfly" | "star" | "flower" | "balloon" | "book" | "rocket" | "shell" | "none";
export type ProjectStatus = "draft" | "ready" | "published";
export type CharacterMotion = "bounce" | "walk" | "dance" | "float" | "wave";
export type CameraMotion = "push-in" | "pan-left" | "pan-right" | "steady";
export type SceneTransition = "fade" | "slide" | "pop" | "cut";
export type Expression = "happy" | "excited" | "curious" | "sleepy" | "surprised";
export type CaptionStyle = "storybook" | "comic" | "subtitles";
export type MusicPreset = "playful" | "dreamy" | "adventure" | "off";
export type VoiceProvider = "pollinations" | "elevenlabs";

export type EditorSettings = {
  captionStyle: CaptionStyle;
  music: MusicPreset;
  musicVolume: number;
  voiceVolume: number;
  voiceProvider: VoiceProvider;
  voiceId: string;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  captionStyle: "storybook",
  music: "playful",
  musicVolume: 28,
  voiceVolume: 90,
  voiceProvider: "pollinations",
  voiceId: "af_heart",
};

export const POLLINATIONS_VOICES = [
  { id: "af_heart", name: "Sunny", description: "Warm storyteller" },
  { id: "af_bella", name: "Bella", description: "Bright & expressive" },
  { id: "af_nova", name: "Nova", description: "Gentle & clear" },
  { id: "am_puck", name: "Puck", description: "Playful character" },
  { id: "am_adam", name: "Adam", description: "Calm narrator" },
  { id: "bf_emma", name: "Emma", description: "Soft bedtime voice" },
] as const;

export type StoryScene = {
  id: string;
  heading: string;
  caption: string;
  narration: string;
  visualPrompt: string;
  palette: Palette;
  character: Character;
  prop: Prop;
  duration?: number;
  motion?: CharacterMotion;
  camera?: CameraMotion;
  transition?: SceneTransition;
  expression?: Expression;
  showCharacter?: boolean;
  artUrl?: string;
  videoUrl?: string;
  videoPosterUrl?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceCredit?: string;
  audioData?: string;
  audioSource?: "generated" | "uploaded" | "recorded";
};

export type ViewName = "overview" | "create" | "projects" | "discover" | "ideas" | "queue" | "settings" | "assistant" | "editor" | "agent";

export type AutoSettings = {
  enabled: boolean;
  autoPost: boolean;
  visibility: "private" | "unlisted" | "public";
  lastRunDate: string | null;
};

export type MediaAsset = {
  id: string;
  source: "pexels" | "pixabay" | "pollinations" | "manual";
  title: string;
  author: string;
  authorUrl?: string;
  pageUrl: string;
  downloadUrl: string;
  posterUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  tags: string[];
  licenseNote: string;
  aiGenerated?: boolean;
};

export type StudioProject = {
  id: string;
  title: string;
  idea: string;
  category: string;
  ageGroup: string;
  duration: number;
  style: string;
  character: Character;
  scenes: StoryScene[];
  editSettings?: EditorSettings;
  status: ProjectStatus;
  thumbnail: string | null;
  youtubeTitle: string;
  description: string;
  tags: string[];
  privacy: "private" | "unlisted" | "public";
  youtubeVideoId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudioConfig = {
  openRouterConfigured: boolean;
  pollinationsConfigured: boolean;
  elevenLabsConfigured: boolean;
  pexelsConfigured: boolean;
  pixabayConfigured: boolean;
  youtubeConfigured: boolean;
  youtubeConnected: boolean;
  youtubeChannelTitle: string | null;
  youtubeChannelAvatar: string | null;
};

export const CATEGORIES = ["Adventure", "Animals", "Learning", "Bedtime", "Ocean", "Space", "Kindness", "Dinosaurs"];
export const CHARACTERS: { value: Character; label: string; emoji: string }[] = [
  { value: "fox", label: "Foxy", emoji: "🦊" },
  { value: "bunny", label: "Bunny", emoji: "🐰" },
  { value: "bear", label: "Bear", emoji: "🐻" },
  { value: "turtle", label: "Turtle", emoji: "🐢" },
  { value: "dino", label: "Dino", emoji: "🦕" },
  { value: "cat", label: "Kitty", emoji: "🐱" },
  { value: "astronaut", label: "Space buddy", emoji: "🚀" },
];

export const IDEA_PROMPTS = [
  { title: "The moon forgot to glow", category: "Bedtime", emoji: "🌙", color: "lavender", description: "A gentle bedtime adventure among the stars." },
  { title: "A tiny turtle makes a big friend", category: "Ocean", emoji: "🐢", color: "mint", description: "An undersea tale about unexpected friendship." },
  { title: "The dinosaur who loved to dance", category: "Dinosaurs", emoji: "🦕", color: "peach", description: "A joyful story about being yourself." },
  { title: "Why do flowers follow the sun?", category: "Learning", emoji: "🌼", color: "yellow", description: "A playful little science discovery." },
  { title: "A fox finds a lost firefly", category: "Adventure", emoji: "🦊", color: "coral", description: "A glowing journey through the meadow." },
  { title: "The cloud that wanted to paint", category: "Kindness", emoji: "☁️", color: "blue", description: "A colorful story about sharing your gifts." },
  { title: "A bear visits planet Sprinkle", category: "Space", emoji: "🪐", color: "lavender", description: "An out-of-this-world little adventure." },
  { title: "The shy kitten's first hello", category: "Animals", emoji: "🐱", color: "mint", description: "A warm story about making new friends." },
];

const SAMPLE_DATE = "2026-02-18T10:00:00.000Z";

export const SAMPLE_PROJECTS: StudioProject[] = [
  {
    id: "f241b5b4-6fa1-4523-9b5a-7e31bf3d1321",
    title: "The Fox & the Firefly",
    idea: "A little fox helps a lost firefly find its way home",
    category: "Adventure",
    ageGroup: "3–5 years",
    duration: 30,
    style: "Storybook",
    character: "fox",
    status: "ready",
    thumbnail: "/images/thumb-fox.png",
    youtubeTitle: "The Fox & the Firefly ✨ | A Little Story About Kindness #Shorts",
    description: "Follow a little fox and a glowing firefly on a gentle adventure about helping a friend find their way home. A sweet original cartoon story for little ones.\n\n#Shorts #KidsStories #CartoonForKids",
    tags: ["kids stories", "cartoon", "kindness", "fox", "shorts"],
    privacy: "private",
    youtubeVideoId: null,
    createdAt: SAMPLE_DATE,
    updatedAt: SAMPLE_DATE,
    scenes: [
      { id: "fox-1", heading: "A curious discovery", caption: "One sunny day, Foxy found a little light!", narration: "One sunny day, Foxy spotted a tiny light dancing in the grass.", visualPrompt: "A small friendly orange fox in a sunny meadow spots a glowing firefly among daisies, children's storybook art", palette: "meadow", character: "fox", prop: "butterfly" },
      { id: "fox-2", heading: "A new little friend", caption: "It was a firefly named Pip.", narration: "It was Pip the firefly! But Pip had lost the way home.", visualPrompt: "Friendly fox meets a glowing firefly in a pastel green meadow, warm children's storybook", palette: "forest", character: "fox", prop: "star" },
      { id: "fox-3", heading: "Let's look together", caption: "“I'll help you,” Foxy said.", narration: "Don't worry, said Foxy. We'll find your family together!", visualPrompt: "Kind little orange fox searching through flowers with a firefly companion, soft storybook illustration", palette: "sunset", character: "fox", prop: "flower" },
      { id: "fox-4", heading: "A sky full of lights", caption: "Then the whole sky began to sparkle!", narration: "As the sun went down, hundreds of fireflies lit up the sky.", visualPrompt: "Fox sees many glowing fireflies beneath a purple twilight sky, magical storybook scene", palette: "night", character: "fox", prop: "star" },
      { id: "fox-5", heading: "Home, sweet home", caption: "Pip was home. Hooray for helping friends!", narration: "Pip was home at last! Foxy learned that a little kindness can shine so bright.", visualPrompt: "Happy fox waving goodbye to a reunited firefly family in a glowing magical meadow, picture book", palette: "meadow", character: "fox", prop: "star" },
    ],
  },
  {
    id: "626e88dc-c836-4312-b2d0-3be0c52b9b27",
    title: "Tilly's Ocean Hello",
    idea: "A little turtle makes a new friend under the sea",
    category: "Ocean",
    ageGroup: "3–5 years",
    duration: 24,
    style: "Storybook",
    character: "turtle",
    status: "draft",
    thumbnail: "/images/thumb-ocean.png",
    youtubeTitle: "Tilly's Ocean Hello 🐢 | A Friendship Story #Shorts",
    description: "Dive under the sea with Tilly the turtle in this original little story about finding a friend.\n\n#Shorts #KidsStories #OceanCartoon",
    tags: ["kids stories", "turtle", "ocean", "friendship", "shorts"],
    privacy: "private",
    youtubeVideoId: null,
    createdAt: SAMPLE_DATE,
    updatedAt: SAMPLE_DATE,
    scenes: [
      { id: "ocean-1", heading: "Under the sea", caption: "Tilly loved her big blue ocean.", narration: "Tilly the turtle loved swimming through the big blue ocean.", visualPrompt: "Cute sea turtle swimming among coral reefs and bubbles, pastel picture book illustration", palette: "ocean", character: "turtle", prop: "shell" },
      { id: "ocean-2", heading: "A tiny hello", caption: "“Hello!” said a little pink fish.", narration: "One morning, a little pink fish peeked out and said hello!", visualPrompt: "Friendly turtle meets a tiny pink fish by pastel coral under the sea, children's illustration", palette: "ocean", character: "turtle", prop: "star" },
      { id: "ocean-3", heading: "Swim together", caption: "Two friends are better than one.", narration: "Together they found secret shells and made silly bubble shapes.", visualPrompt: "Cute turtle and fish happily exploring seashells underwater, storybook cartoon", palette: "ocean", character: "turtle", prop: "shell" },
      { id: "ocean-4", heading: "A new friend", caption: "Every friendship begins with hello!", narration: "Tilly smiled. Sometimes a new friendship starts with just one little hello.", visualPrompt: "Happy turtle and fish waving under the sea with colorful coral, children's picture book", palette: "ocean", character: "turtle", prop: "star" },
    ],
  },
  {
    id: "dfdc3b75-f5b0-4f99-9107-33e70915de81",
    title: "Dino's Little Big Idea",
    idea: "A baby dinosaur learns that small ideas can make a big difference",
    category: "Learning",
    ageGroup: "5–7 years",
    duration: 30,
    style: "Storybook",
    character: "dino",
    status: "draft",
    thumbnail: "/images/thumb-dino.png",
    youtubeTitle: "Dino's Little Big Idea 🦕 | A Fun Learning Story #Shorts",
    description: "A small dinosaur has a big idea in this original, gentle cartoon about creativity and trying new things.\n\n#Shorts #KidsStories #DinosaurCartoon",
    tags: ["kids stories", "dinosaur", "learning", "creativity", "shorts"],
    privacy: "private",
    youtubeVideoId: null,
    createdAt: SAMPLE_DATE,
    updatedAt: SAMPLE_DATE,
    scenes: [
      { id: "dino-1", heading: "Meet little Dino", caption: "Dino had a little big idea.", narration: "Little Dino had an idea. Could a tiny seed become something big?", visualPrompt: "Cute baby green dinosaur holding a tiny seed in a pastel prehistoric garden, storybook art", palette: "forest", character: "dino", prop: "flower" },
      { id: "dino-2", heading: "Planting time", caption: "First, plant a tiny seed.", narration: "Dino tucked the seed into the soft earth and gave it water.", visualPrompt: "Baby dinosaur planting a seed in a sunny colorful garden, children's picture book", palette: "meadow", character: "dino", prop: "flower" },
      { id: "dino-3", heading: "Wait and wonder", caption: "A little patience goes a long way.", narration: "Every day, Dino watched and waited. Growing takes time!", visualPrompt: "Little dinosaur patiently watching a sprout grow among flowers, storybook cartoon", palette: "sunset", character: "dino", prop: "flower" },
      { id: "dino-4", heading: "Look what grew!", caption: "Wow! A flower for everyone.", narration: "One day, a beautiful flower bloomed for all the friends to enjoy.", visualPrompt: "Baby dinosaur delighted by a giant colorful flower in a sunny garden, picture book", palette: "meadow", character: "dino", prop: "flower" },
      { id: "dino-5", heading: "Small is mighty", caption: "Big things start with little ideas!", narration: "Dino learned that even the biggest things can start very, very small.", visualPrompt: "Proud friendly baby dinosaur beside a blooming flower, cheerful pastel storybook", palette: "candy", character: "dino", prop: "star" },
    ],
  },
];
