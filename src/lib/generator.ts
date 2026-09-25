/* ──────────────────────────────────────────────────────────────────────────
   ReelForge "AI" engine — a deterministic, template-driven pipeline that
   mimics a generative video model: topic + niche → script → timed scenes →
   word-level captions. Pure functions, safe to import from server & client.
   ────────────────────────────────────────────────────────────────────────── */

export type NicheId =
  | "space"
  | "history"
  | "money"
  | "psychology"
  | "ocean"
  | "tech";

export type VoiceId = "nova" | "atlas" | "orion" | "lyra" | "sage";
export type StyleId = "cinematic" | "neon" | "retro" | "mono";

export interface CaptionWord {
  w: string;
  start: number;
  end: number;
}

export interface ScriptScene {
  beat: string;
  text: string;
  img: string;
  kb: "kb-in" | "kb-out" | "kb-left" | "kb-right";
  start: number;
  end: number;
  words: CaptionWord[];
}

export interface GeneratedShort {
  topic: string;
  niche: string;
  voice: string;
  style: string;
  title: string;
  score: number;
  duration: number; // seconds
  scenes: ScriptScene[];
}

export const NICHES: {
  id: NicheId;
  label: string;
  img: string;
  hue: string;
  blurb: string;
  topics: string[];
}[] = [
  {
    id: "space",
    label: "Space & Cosmos",
    img: "/scenes/space.jpg",
    hue: "#8B7CFF",
    blurb: "Black holes, dead stars and cosmic horror.",
    topics: ["black holes", "rogue planets", "the heat death of the universe", "neutron stars", "the Fermi paradox"],
  },
  {
    id: "history",
    label: "Dark History",
    img: "/scenes/history.jpg",
    hue: "#FFB86B",
    blurb: "The stories your teacher skipped.",
    topics: ["the fall of Rome", "roman concrete", "the Library of Alexandria", "Pompeii's last day", "the Bronze Age collapse"],
  },
  {
    id: "money",
    label: "Money & Power",
    img: "/scenes/money.jpg",
    hue: "#FFD94D",
    blurb: "The cheat codes nobody teaches.",
    topics: ["compound interest", "the 1971 gold shock", "silent inflation", "asymmetric bets", "the wealth transfer of 2008"],
  },
  {
    id: "psychology",
    label: "Mind & Psychology",
    img: "/scenes/mind.jpg",
    hue: "#C77CFF",
    blurb: "Biases that run your life.",
    topics: ["dopamine detoxing", "the spotlight effect", "deep focus", "loss aversion", "the Dunning-Kruger effect"],
  },
  {
    id: "ocean",
    label: "Deep Ocean",
    img: "/scenes/ocean.jpg",
    hue: "#4DDBFF",
    blurb: "The last unexplored frontier.",
    topics: ["the Mariana Trench", "bioluminescence", "rogue waves", "the bloop", "hydrothermal vents"],
  },
  {
    id: "tech",
    label: "AI & Tech",
    img: "/scenes/tech.jpg",
    hue: "#FF6BC1",
    blurb: "The future, arriving early.",
    topics: ["AGI timelines", "the dead internet theory", "humanoid robots", "quantum supremacy", "AI agents"],
  },
];

export const VOICES: {
  id: VoiceId;
  name: string;
  vibe: string;
  bestFor: string;
  pitch: number;
  rate: number;
  sample: string;
}[] = [
  {
    id: "nova",
    name: "Nova",
    vibe: "Bright & hyped",
    bestFor: "Listicles, facts, hype",
    pitch: 1.15,
    rate: 1.06,
    sample: "Hey, I'm Nova — the voice behind a million viral shorts.",
  },
  {
    id: "atlas",
    name: "Atlas",
    vibe: "Deep documentary",
    bestFor: "History, mystery, cosmos",
    pitch: 0.82,
    rate: 0.94,
    sample: "I'm Atlas. I narrate the stories that keep people watching until 3 a.m.",
  },
  {
    id: "orion",
    name: "Orion",
    vibe: "Cinematic calm",
    bestFor: "Luxury, money, motivation",
    pitch: 1.0,
    rate: 0.92,
    sample: "Orion here. Calm, cinematic, and impossible to scroll past.",
  },
  {
    id: "lyra",
    name: "Lyra",
    vibe: "Soft storyteller",
    bestFor: "Psychology, wellness, lore",
    pitch: 1.3,
    rate: 1.0,
    sample: "I'm Lyra — a soft storyteller for the ideas that deserve a quiet voice.",
  },
  {
    id: "sage",
    name: "Sage",
    vibe: "Crisp newscaster",
    bestFor: "Tech, news, explainers",
    pitch: 1.05,
    rate: 1.12,
    sample: "This is Sage. Fast, crisp, and always on the story first.",
  },
];

export const STYLES: {
  id: StyleId;
  label: string;
  filter: string;
}[] = [
  { id: "cinematic", label: "Cinematic", filter: "saturate(1.12) contrast(1.06)" },
  { id: "neon", label: "Neon Pop", filter: "saturate(1.65) contrast(1.18) hue-rotate(12deg)" },
  { id: "retro", label: "Retro Film", filter: "sepia(0.42) saturate(0.92) contrast(1.05)" },
  { id: "mono", label: "Noir Mono", filter: "grayscale(1) contrast(1.22) brightness(1.05)" },
];

const BEATS = ["HOOK", "SETUP", "TWIST", "PAYOFF", "CTA"] as const;

type ScriptVariant = [string, string, string, string, string];

const SCRIPTS: Record<NicheId, ScriptVariant[]> = {
  space: [
    [
      "Nobody talks about how terrifying {topic} actually are.",
      "Last year, astronomers pointed their best telescopes at {topic} — and the data broke their models.",
      "It turns out {topic} behave nothing like the textbooks promised. Not even close.",
      "One researcher called it the universe hiding its own instruction manual.",
      "Follow for more space stories they never taught you in school.",
    ],
    [
      "If {topic} vanished tomorrow, you would never even know.",
      "Light takes time to travel — so everything you know about {topic} already happened, long ago.",
      "But here's the twist: {topic} may be far stranger than simulation theory ever predicted.",
      "We are, quite literally, looking at ghosts every time we look up.",
      "Save this — and send it to someone who needs perspective today.",
    ],
  ],
  history: [
    [
      "This is the {topic} story your history teacher skipped.",
      "Two thousand years ago, {topic} changed the fate of an entire empire in a single night.",
      "But the record was written by the winners — and the winners lied.",
      "Archaeologists just found the proof, buried under fourteen feet of ash and silence.",
      "Comment PART 2, and I'll expose the next chapter.",
    ],
    [
      "Everyone gets {topic} completely wrong.",
      "For centuries we believed the official story, because questioning it was dangerous.",
      "Then a single discovery rewrote everything we thought we knew about {topic}.",
      "The uncomfortable truth: it was never about glory. It was about control.",
      "Follow — the next episode goes deeper than the textbooks dare.",
    ],
  ],
  money: [
    [
      "Rich people understand {topic}. Everyone else ignores it.",
      "In 1971, the rules of money quietly changed — and {topic} became the ultimate cheat code.",
      "Schools never teach it, because the system depends on you not knowing.",
      "One percent of people use {topic} to buy assets, while everyone else finances liabilities.",
      "Send this to someone who needs to hear it before 2030.",
    ],
    [
      "You're not bad with money. You were never taught {topic}.",
      "The system runs on one quiet mechanism — and {topic} is the gear that turns it all.",
      "Here's the twist: it's boring, legal, and hiding in plain sight.",
      "People who master it stop trading time for money — permanently.",
      "Follow if you're done playing a game with no rulebook.",
    ],
  ],
  psychology: [
    [
      "Your brain is lying to you about {topic}.",
      "Psychologists traced it to a hidden bias that steers ninety percent of your decisions.",
      "The scariest part? Once you see it, you can never unsee it again.",
      "People who master {topic} report deeper focus, calmer sleep, and sharper thinking.",
      "Save this video — future you will be grateful.",
    ],
    [
      "There's a reason you can't stop thinking about {topic}.",
      "Your mind runs on ancient software, and {topic} exploits a bug it never patched.",
      "Advertisers know it. Apps are built on it. You live inside it.",
      "The fix takes eleven seconds, and most people will never do it once.",
      "Share this with the most distracted person you know.",
    ],
  ],
  ocean: [
    [
      "We know more about the surface of the Moon than about {topic}.",
      "Eighty percent of the ocean is unmapped, unobserved, and completely unexplored.",
      "And every expedition to {topic} returns with something that shouldn't exist.",
      "Down there, creatures rewrite what we thought life itself could be.",
      "Follow before the next discovery breaks the internet.",
    ],
    [
      "In 1997, hydrophones picked up a sound from {topic} that no animal should make.",
      "It was louder than a blue whale — and it came from somewhere we've never been.",
      "Scientists gave it a name, then quietly stopped talking about it.",
      "The ocean doesn't hide its monsters. It just hides the map.",
      "Comment DESCEND and I'll take you one layer deeper.",
    ],
  ],
  tech: [
    [
      "{topic} just crossed a line experts said was decades away.",
      "While you were scrolling, the benchmarks quietly broke — one after another.",
      "The people building {topic} aren't celebrating. They're publishing warnings.",
      "The next eighteen months will decide who wins the next fifty years.",
      "Share this before the algorithm buries it.",
    ],
    [
      "Nobody noticed when {topic} went exponential.",
      "There was no keynote, no headline — just a graph that refused to slow down.",
      "Here's the twist: the bottleneck was never the technology. It was our imagination.",
      "The people who understand {topic} today are writing the rules everyone else will live by.",
      "Follow — I translate the future before it trends.",
    ],
  ],
};

const GENERIC: ScriptVariant[] = [
  [
    "Everyone's talking about {topic}. Nobody's telling you this.",
    "We dug into {topic} for weeks — and the pattern is impossible to ignore.",
    "The part nobody mentions is the part that matters most.",
    "Once you truly understand {topic}, you start seeing it everywhere.",
    "Follow for the next drop — it goes much deeper.",
  ],
  [
    "This is {topic} — explained before your attention span runs out.",
    "Strip away the noise and {topic} comes down to one brutal mechanism.",
    "Most experts complicate it, because simple truths don't sell courses.",
    "You're now ahead of ninety percent of people on this.",
    "Send this to the friend who's always wrong about {topic}.",
  ],
];

const TITLES: Record<NicheId | "generic", string[]> = {
  space: ["The truth about {T}", "{T} — a cosmic horror story", "What {T} are hiding"],
  history: ["{T}: the untold chapter", "They lied about {T}", "{T}, explained in 30 seconds"],
  money: ["{T} — the cheat code", "How the rich use {T}", "{T}, minus the BS"],
  psychology: ["Your brain on {T}", "{T}: the hidden bias", "Why {T} controls you"],
  ocean: ["What lives in {T}", "{T} — the last frontier", "The signal from {T}"],
  tech: ["{T} just went exponential", "The {T} wake-up call", "{T}: what insiders know"],
  generic: ["{T} in 30 seconds", "The {T} playbook", "{T} — what they won't say"],
};

/* deterministic 32-bit hash so a topic always yields the same draft */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function fill(template: string, topic: string): string {
  return template.replaceAll("{topic}", topic);
}

const KB: ScriptScene["kb"][] = ["kb-in", "kb-left", "kb-out", "kb-right", "kb-in"];

export function generateShort(opts: {
  topic: string;
  niche: NicheId | "custom";
  voice: VoiceId;
  style: StyleId;
  variant?: number;
}): GeneratedShort {
  const topic = opts.topic.trim().replace(/\s+/g, " ").slice(0, 90) || "this idea";
  const isKnown = opts.niche !== "custom" && SCRIPTS[opts.niche as NicheId];
  const bank = isKnown ? SCRIPTS[opts.niche as NicheId] : GENERIC;
  const h = hash(topic.toLowerCase() + "|" + opts.niche);
  const variant = ((opts.variant ?? 0) + h) % bank.length;
  const script = bank[variant];

  const img = isKnown
    ? NICHES.find((n) => n.id === opts.niche)!.img
    : NICHES[h % NICHES.length].img;

  /* word-level timing */
  const scenes: ScriptScene[] = [];
  let cursor = 0.35; // cold-open padding
  script.forEach((beatText, i) => {
    const text = fill(beatText, topic);
    const start = cursor;
    const words: CaptionWord[] = [];
    text.split(" ").forEach((w) => {
      const clean = w.replace(/[^a-zA-Z0-9']/g, "");
      const dur = Math.min(0.58, 0.16 + clean.length * 0.052);
      words.push({ w, start: cursor, end: cursor + dur });
      cursor += dur + 0.045;
    });
    let end = cursor + 0.24; // beat pause
    if (i === 0 && end - start < 2.3) end = start + 2.3; // let the hook land
    cursor = end;
    scenes.push({ beat: BEATS[i], text, img, kb: KB[i % KB.length], start, end, words });
  });

  const titleBank = isKnown ? TITLES[opts.niche as NicheId] : TITLES.generic;
  const titled = topic.charAt(0).toUpperCase() + topic.slice(1);
  const title = titleBank[h % titleBank.length].replaceAll("{T}", titled);

  return {
    topic,
    niche: opts.niche,
    voice: opts.voice,
    style: opts.style,
    title,
    score: 84 + (h % 15),
    duration: Math.round(cursor * 10) / 10,
    scenes,
  };
}

/* Pre-baked shorts for the hero phones (no DB required) */
export const SAMPLE_SHORTS: GeneratedShort[] = [
  generateShort({ topic: "black holes", niche: "space", voice: "atlas", style: "cinematic" }),
  generateShort({ topic: "dopamine detoxing", niche: "psychology", voice: "nova", style: "neon" }),
  generateShort({ topic: "the fall of Rome", niche: "history", voice: "orion", style: "retro" }),
];

export const TRENDING_TOPICS = [
  "The Fermi paradox",
  "Compound interest",
  "The Library of Alexandria",
  "Dopamine detoxing",
  "The Mariana Trench",
  "AGI timelines",
  "Pompeii's last day",
  "Silent inflation",
  "The spotlight effect",
  "Rogue waves",
  "The dead internet theory",
  "Roman concrete",
  "Black holes",
  "Loss aversion",
  "Quantum supremacy",
];
