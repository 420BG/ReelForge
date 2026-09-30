import type { Audience, CaptionAnimation, MusicMood, TransitionKind, VisualStyle, VoiceStyle } from "@/content/types";

/**
 * Niche registry. To add a niche, append one object to NICHES — nothing else in the
 * app needs to change: the story engine, voice picker, audio designer, captions,
 * SEO and the UI all read from this definition.
 */
export type NicheDefinition = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** "kids" niches upload as made-for-kids; everything else uploads as not-for-kids. */
  audience: Audience;
  subNiches: { id: string; label: string }[];
  tone: string;
  /** Original hook skeletons. The writer adapts them; it never copies other creators' scripts. */
  hookPatterns: string[];
  /** Extra writing rules sent to the story model. */
  storyRules: string;
  /** "always" = fiction (disclaimer added), "never" = factual (accuracy rules), "mixed" = decided per story. */
  fiction: "always" | "never" | "mixed";
  defaultStyle: VisualStyle;
  visualKeywords: string;
  colorGrade: "horror" | "romance" | "mystery" | "punchy" | "clean-cool" | "vintage" | "vivid" | "neutral";
  musicMood: MusicMood;
  ambience: string[];
  voice: { gender: "female" | "male"; style: VoiceStyle; pace: number };
  captionAnimation: CaptionAnimation;
  transitions: TransitionKind[];
  seo: { categoryId: string; baseTags: string[]; hashtags: string[] };
  /** Local hours that tend to suit the audience (owner timezone). */
  publishHours: number[];
  pacing: "slow" | "medium" | "fast";
};

export const NICHES: NicheDefinition[] = [
  {
    id: "horror",
    label: "Horror / Scary stories",
    emoji: "🕯️",
    description: "Creepy, atmospheric short stories built on dread and a final sting.",
    audience: "general",
    subNiches: [
      { id: "true-style", label: "True-style scary story (fiction)" },
      { id: "psychological", label: "Psychological horror" },
      { id: "paranormal", label: "Paranormal encounter" },
      { id: "haunted-place", label: "Haunted place" },
      { id: "creepy-mystery", label: "Creepy mystery" },
      { id: "urban-legend", label: "Urban legend (original)" },
      { id: "coincidence", label: "Disturbing coincidence" },
      { id: "3am", label: "What happened at 3:00 AM" },
      { id: "unexplained", label: "Unexplained event" },
    ],
    tone: "slow-burning dread, quiet and specific, ends on a chilling reveal",
    hookPatterns: [
      "At exactly {time}, {character}'s phone {strange event}…",
      "{character} thought {pronoun} was alone in {place}.",
      "The last photo on {character}'s phone showed something that wasn't there before.",
      "Every night the same {sound} came from {place}. Then one night it stopped.",
      "{character} got a message from a number that didn't exist.",
    ],
    storyRules: "Build tension through small wrong details (sounds, timestamps, shadows). No gore, no self-harm, no real crimes, no real named people or places presented as real events. The ending must reveal or imply something unsettling. If styled as a 'true story', it is still ORIGINAL FICTION and must never claim to be real.",
    fiction: "always",
    defaultStyle: "dark-cinematic",
    visualKeywords: "low-key lighting, deep shadows, cold blue moonlight, volumetric haze, film grain",
    colorGrade: "horror",
    musicMood: "suspense",
    ambience: ["wind", "electrical hum", "distant heartbeat"],
    voice: { gender: "female", style: "horror", pace: 0.94 },
    captionAnimation: "pop",
    transitions: ["fadeblack", "dissolve", "cut", "fade"],
    seo: { categoryId: "24", baseTags: ["scary story", "horror short", "creepy", "fiction"], hashtags: ["#scarystories", "#horror", "#creepy"] },
    publishHours: [20, 21, 22],
    pacing: "slow",
  },
  {
    id: "love",
    label: "Love / Relationships",
    emoji: "💌",
    description: "Short emotional love stories with a turn at the end.",
    audience: "general",
    subNiches: [
      { id: "emotional", label: "Short emotional love story" },
      { id: "unexpected", label: "Unexpected romance" },
      { id: "breakup", label: "Breakup" },
      { id: "long-distance", label: "Long-distance relationship" },
      { id: "second-chance", label: "Second chance" },
      { id: "heartbreak", label: "Heartbreaking ending" },
      { id: "twist", label: "Twist ending" },
      { id: "lesson", label: "Relationship lesson" },
    ],
    tone: "tender, intimate, bittersweet; small gestures carry the emotion",
    hookPatterns: [
      "{character} kept every note {other} ever wrote. Except one.",
      "They met on the last train of the night — and never learned each other's names.",
      "For three years, {character} set two cups of coffee on the table.",
      "{other} said goodbye at the airport. {character} didn't know it was the last time.",
    ],
    storyRules: "Adults only (clearly over 18). No explicit content. Show emotion through actions and looks between the characters; keep them visually consistent. End on a twist, a quiet revelation, or a line that lands.",
    fiction: "always",
    defaultStyle: "cinematic",
    visualKeywords: "golden hour, soft bokeh, warm practical lights, shallow depth of field",
    colorGrade: "romance",
    musicMood: "romantic",
    ambience: ["city night", "soft rain"],
    voice: { gender: "female", style: "warm", pace: 0.97 },
    captionAnimation: "fade",
    transitions: ["dissolve", "fade", "fadeblack"],
    seo: { categoryId: "24", baseTags: ["love story", "short story", "emotional", "romance"], hashtags: ["#lovestory", "#romance", "#storytime"] },
    publishHours: [19, 21, 22],
    pacing: "medium",
  },
  {
    id: "mystery",
    label: "Mystery",
    emoji: "🔎",
    description: "Disappearances, strange messages, clues and discoveries.",
    audience: "general",
    subNiches: [
      { id: "unsolved", label: "Unsolved mystery (original)" },
      { id: "disappearance", label: "Strange disappearance" },
      { id: "clues", label: "Hidden clues" },
      { id: "phone-call", label: "Mysterious phone call" },
      { id: "message", label: "Strange message" },
      { id: "discovery", label: "Unexpected discovery" },
    ],
    tone: "investigative, clue-by-clue, curious and tense",
    hookPatterns: [
      "The house was empty — but dinner was still warm.",
      "Every letter in the note was cut from a newspaper printed {years} years in the future.",
      "{character} found a key taped under a library desk. The tag had {pronoun} name on it.",
    ],
    storyRules: "Plant clues the viewer can notice. Pay them off in the final scene. Original fiction unless the user explicitly asks for a documented real case — in that case stick to well-established facts and say what is unknown.",
    fiction: "mixed",
    defaultStyle: "cinematic",
    visualKeywords: "teal and orange, desk lamps, rain-streaked windows, close-up clue inserts",
    colorGrade: "mystery",
    musicMood: "mysterious",
    ambience: ["clock tick", "soft rain"],
    voice: { gender: "male", style: "storytelling", pace: 1.0 },
    captionAnimation: "pop",
    transitions: ["cut", "dissolve", "wipeleft", "fadeblack"],
    seo: { categoryId: "24", baseTags: ["mystery", "unsolved", "short story", "plot twist"], hashtags: ["#mystery", "#storytime", "#plottwist"] },
    publishHours: [18, 20, 21],
    pacing: "medium",
  },
  {
    id: "motivation",
    label: "Motivation",
    emoji: "🔥",
    description: "Comebacks, discipline and failure-to-success stories.",
    audience: "general",
    subNiches: [
      { id: "inspirational", label: "Short inspirational story" },
      { id: "comeback", label: "Comeback story" },
      { id: "life-lesson", label: "Life lesson" },
      { id: "discipline", label: "Discipline" },
      { id: "success", label: "Success story" },
      { id: "failure-to-success", label: "Failure to success" },
    ],
    tone: "driving, honest, earned — no empty hype",
    hookPatterns: [
      "He failed {n} times. Number {n+1} changed everything.",
      "Nobody saw her train at 5 AM. Everybody saw the result.",
      "Discipline isn't punishment. It's the price of freedom.",
    ],
    storyRules: "Use an original composite character unless the user names a real public figure; never invent facts or quotes about real people. Concrete scenes over slogans. End on one line the viewer remembers.",
    fiction: "mixed",
    defaultStyle: "cinematic",
    visualKeywords: "high contrast, sunrise rim light, sweat and breath in cold air, epic wide shots",
    colorGrade: "punchy",
    musicMood: "epic",
    ambience: ["wind"],
    voice: { gender: "male", style: "excited", pace: 1.03 },
    captionAnimation: "karaoke",
    transitions: ["cut", "zoomin", "fadeblack"],
    seo: { categoryId: "22", baseTags: ["motivation", "discipline", "self improvement", "mindset"], hashtags: ["#motivation", "#discipline", "#mindset"] },
    publishHours: [6, 7, 18],
    pacing: "fast",
  },
  {
    id: "psychology",
    label: "Psychology",
    emoji: "🧠",
    description: "Human behaviour, biases and 'why people do this' explained.",
    audience: "general",
    subNiches: [
      { id: "behavior", label: "Human behavior" },
      { id: "phenomena", label: "Psychological phenomenon" },
      { id: "social", label: "Social behavior" },
      { id: "relationships", label: "Relationship psychology" },
      { id: "biases", label: "Cognitive bias" },
      { id: "why-people", label: "Why people do this…" },
    ],
    tone: "curious, clear, a little surprising",
    hookPatterns: [
      "There's a reason you remember embarrassing moments at 2 AM.",
      "Why do people trust a stranger more after a small favour?",
      "Your brain lies to you about {topic} every single day.",
    ],
    storyRules: "FACTUAL: only state well-established findings; name the effect correctly; no invented statistics or fake studies; hedge where evidence is mixed ('research suggests'). Illustrate with a short relatable scene.",
    fiction: "never",
    defaultStyle: "animation-3d",
    visualKeywords: "clean stylized 3D, soft studio light, symbolic visuals of thoughts",
    colorGrade: "clean-cool",
    musicMood: "curious",
    ambience: [],
    voice: { gender: "female", style: "documentary", pace: 1.02 },
    captionAnimation: "karaoke",
    transitions: ["cut", "slideleft", "zoomin"],
    seo: { categoryId: "27", baseTags: ["psychology", "psychology facts", "human behavior", "brain"], hashtags: ["#psychology", "#psychologyfacts", "#brain"] },
    publishHours: [12, 18, 20],
    pacing: "fast",
  },
  {
    id: "science",
    label: "Science",
    emoji: "🪐",
    description: "Space, AI, the human body, oceans, time and physics.",
    audience: "general",
    subNiches: [
      { id: "space", label: "Space" },
      { id: "ai", label: "AI" },
      { id: "future-tech", label: "Future technology" },
      { id: "strange-facts", label: "Strange scientific fact" },
      { id: "human-body", label: "Human body" },
      { id: "ocean", label: "Ocean mysteries" },
      { id: "time-physics", label: "Time and physics" },
    ],
    tone: "awe-driven, precise, easy to follow",
    hookPatterns: [
      "If you fell into {object}, this is what you'd see.",
      "There's a place in the ocean deeper than {mountain} is tall.",
      "Right now, your body is replacing {thing} — and you can't feel it.",
    ],
    storyRules: "FACTUAL: numbers must be real and rounded honestly; label speculation as speculation; no invented discoveries. Future tech must be framed as possibility, not fact.",
    fiction: "never",
    defaultStyle: "cinematic",
    visualKeywords: "photoreal space and nature cinematography, volumetric light, macro detail",
    colorGrade: "clean-cool",
    musicMood: "epic",
    ambience: [],
    voice: { gender: "male", style: "documentary", pace: 1.0 },
    captionAnimation: "karaoke",
    transitions: ["dissolve", "zoomin", "cut"],
    seo: { categoryId: "28", baseTags: ["science", "space", "science facts", "physics"], hashtags: ["#science", "#space", "#sciencefacts"] },
    publishHours: [12, 17, 20],
    pacing: "medium",
  },
  {
    id: "history",
    label: "History",
    emoji: "🏛️",
    description: "Strange events, forgotten stories and ancient civilizations.",
    audience: "general",
    subNiches: [
      { id: "strange-events", label: "Strange historical event" },
      { id: "forgotten", label: "Forgotten story" },
      { id: "mysteries", label: "Historical mystery" },
      { id: "ancient", label: "Ancient civilization" },
      { id: "didnt-know", label: "You probably didn't know…" },
    ],
    tone: "vivid, grounded, respectful of real people",
    hookPatterns: [
      "In {year}, a whole town {strange event}.",
      "This {object} was lost for {n} years — and then it turned up in {place}.",
      "You probably didn't know that {civilization} used {surprising thing}.",
    ],
    storyRules: "FACTUAL: only documented events, correct dates and names; mark legends as legends; do not dramatise with invented dialogue attributed to real people.",
    fiction: "never",
    defaultStyle: "cinematic",
    visualKeywords: "period-accurate costumes and architecture, candlelight, dust in light beams",
    colorGrade: "vintage",
    musicMood: "mysterious",
    ambience: ["wind"],
    voice: { gender: "male", style: "storytelling", pace: 0.98 },
    captionAnimation: "fade",
    transitions: ["dissolve", "fadeblack", "cut"],
    seo: { categoryId: "27", baseTags: ["history", "history facts", "ancient history", "forgotten history"], hashtags: ["#history", "#historyfacts", "#ancienthistory"] },
    publishHours: [13, 19, 21],
    pacing: "medium",
  },
  {
    id: "weird",
    label: "Weird / Interesting",
    emoji: "🌀",
    description: "Strange facts, unusual places and unbelievable-but-true events.",
    audience: "general",
    subNiches: [
      { id: "strange-facts", label: "Strange facts" },
      { id: "places", label: "Unusual places" },
      { id: "discoveries", label: "Weird discoveries" },
      { id: "internet", label: "Internet mysteries" },
      { id: "unbelievable", label: "Unbelievable but factual" },
    ],
    tone: "playfully uncanny, fast reveals",
    hookPatterns: [
      "There's a {place} where {strange rule}.",
      "This sounds fake, but {claim}.",
      "Nobody knows who {did something} — and it's still happening.",
    ],
    storyRules: "FACTUAL where it claims to be real: only verifiable facts, no exaggeration of numbers. Clearly label unknowns and internet rumours as unverified.",
    fiction: "never",
    defaultStyle: "realistic",
    visualKeywords: "documentary realism, drone establishing shots, detail inserts",
    colorGrade: "vivid",
    musicMood: "curious",
    ambience: [],
    voice: { gender: "female", style: "excited", pace: 1.04 },
    captionAnimation: "pop",
    transitions: ["cut", "zoomin", "slideup"],
    seo: { categoryId: "24", baseTags: ["weird facts", "interesting facts", "strange places", "did you know"], hashtags: ["#weirdfacts", "#didyouknow", "#interesting"] },
    publishHours: [12, 16, 20],
    pacing: "fast",
  },
  {
    id: "fiction",
    label: "Fictional stories",
    emoji: "📖",
    description: "Sci-fi, fantasy, thriller, dystopian, romance and more.",
    audience: "general",
    subNiches: [
      { id: "sci-fi", label: "Sci-fi" },
      { id: "fantasy", label: "Fantasy" },
      { id: "horror", label: "Horror" },
      { id: "romance", label: "Romance" },
      { id: "thriller", label: "Thriller" },
      { id: "dystopian", label: "Dystopian" },
      { id: "mystery", label: "Mystery" },
    ],
    tone: "cinematic, world-building in a few strokes, strong final image",
    hookPatterns: [
      "In {year}, memories became currency. {character} just spent {pronoun} last one.",
      "The dragon didn't want the gold. It wanted {surprising thing}.",
      "{character} woke up with a countdown on {pronoun} wrist.",
    ],
    storyRules: "Original worlds and characters only — no existing franchises or characters. Keep the cast small (1–2) and visually consistent.",
    fiction: "always",
    defaultStyle: "animation-3d",
    visualKeywords: "epic cinematic concept art brought to life, dynamic lighting, rich environments",
    colorGrade: "vivid",
    musicMood: "epic",
    ambience: [],
    voice: { gender: "male", style: "storytelling", pace: 1.0 },
    captionAnimation: "pop",
    transitions: ["dissolve", "fadeblack", "circleopen", "cut"],
    seo: { categoryId: "1", baseTags: ["short story", "animated story", "sci fi", "fantasy"], hashtags: ["#shortstory", "#animation", "#storytime"] },
    publishHours: [17, 19, 21],
    pacing: "medium",
  },
  {
    id: "kids",
    label: "Kids stories (made for kids)",
    emoji: "🦊",
    description: "Gentle original cartoons — uploads are marked made-for-kids, like your existing Littleloop projects.",
    audience: "kids",
    subNiches: [
      { id: "friendship", label: "Friendship" },
      { id: "bedtime", label: "Bedtime" },
      { id: "learning", label: "Learning" },
      { id: "adventure", label: "Adventure" },
    ],
    tone: "warm, gentle, upbeat, never scary",
    hookPatterns: ["One sunny morning, {character} found something glowing in the grass."],
    storyRules: "Preschool-safe. No peril, no scary imagery, no brands, no calls to subscribe. Simple words.",
    fiction: "always",
    defaultStyle: "storybook",
    visualKeywords: "soft pastel storybook 3D, rounded shapes, bright friendly light",
    colorGrade: "vivid",
    musicMood: "playful",
    ambience: ["birds"],
    voice: { gender: "female", style: "warm", pace: 0.98 },
    captionAnimation: "pop",
    transitions: ["fade", "slideleft", "circleopen"],
    seo: { categoryId: "1", baseTags: ["kids stories", "cartoon for kids", "bedtime story"], hashtags: ["#kidsstories", "#cartoon"] },
    publishHours: [9, 16, 18],
    pacing: "slow",
  },
];

export function getNiche(id: string | null | undefined): NicheDefinition {
  return NICHES.find((niche) => niche.id === id) ?? NICHES[0];
}

export function isKnownNiche(id: unknown): id is string {
  return typeof id === "string" && NICHES.some((niche) => niche.id === id);
}

/** Niches the autopilot may choose from when the user selects "Let AI choose". Kids niche is never auto-picked. */
export function autoPickableNiches() {
  return NICHES.filter((niche) => niche.audience !== "kids");
}

/** Client-safe summary (no prompt internals needed by the UI). */
export function nicheSummaries() {
  return NICHES.map(({ id, label, emoji, description, audience, subNiches, defaultStyle, pacing }) => ({ id, label, emoji, description, audience, subNiches, defaultStyle, pacing }));
}
