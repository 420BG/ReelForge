import type { NicheDefinition } from "@/content/niches/registry";

/**
 * Built-in fallback writer, used only when no story model answers.
 * It writes original, formulaic FICTION. Plans it produces are tagged source "template"
 * and labelled in the UI. Factual niches are refused: inventing facts would break the
 * "no false claims" rule, so those need a language model.
 */

type Beat = { beat: string; narration: string; visual: string; animation: string; camera: string; atmosphere: string[]; sfx: string[]; transition: string; caption?: string };

function pick<T>(list: T[], seed: number, offset = 0) {
  return list[Math.abs(seed + offset * 7919) % list.length];
}

const NAMES_F = ["Mira", "Lena", "Anya", "Clara", "Nora", "Sana", "Iris", "Maya"];
const NAMES_M = ["Eli", "Theo", "Ravi", "Jonah", "Luca", "Arjun", "Sam", "Noah"];

function horror(seed: number, idea: string) {
  const name = pick(NAMES_F, seed);
  const time = pick(["3:17 AM", "2:44 AM", "3:03 AM", "1:11 AM"], seed, 1);
  const place = pick(["her new apartment", "the old farmhouse", "the hotel's fourth floor", "her grandmother's house"], seed, 2);
  const beats: Beat[] = [
    { beat: "hook", narration: `Every night at exactly ${time}, something knocked on ${name}'s bedroom door.`, visual: `Dark apartment hallway at night, a closed bedroom door, thin strip of light under it, ${idea}`, animation: "light under the door flickers, a shadow passes behind the gap", camera: "slow-push-in", atmosphere: ["flicker", "shadows"], sfx: ["knock", "electrical hum"], transition: "fadeblack", caption: `Every night at ${time}…` },
    { beat: "setup", narration: `She had lived alone in ${place} for three weeks. She told herself it was the pipes.`, visual: `A young woman, ${name}, sitting up in bed in a dim bedroom, phone glowing in her hand`, animation: "she slowly turns her head toward the door, breath visible, curtain drifting", camera: "static", atmosphere: ["shadows"], sfx: ["wind"], transition: "dissolve" },
    { beat: "escalation", narration: "Then one night, the knocking came from inside the closet.", visual: "Bedroom closet door slightly ajar, darkness inside, moonlight across the floor", animation: "closet door creaks open an inch by itself, dust drifting in moonlight", camera: "slow-push-in", atmosphere: ["dust", "shadows"], sfx: ["door creak", "knock"], transition: "cut" },
    { beat: "escalation", narration: "She opened her phone camera to see in the dark.", visual: `POV of a phone screen showing a dark closet in night-vision grain, ${name}'s trembling hand`, animation: "phone shakes slightly, screen noise crawls, something shifts in the dark", camera: "handheld", atmosphere: ["flicker"], sfx: ["heartbeat"], transition: "cut" },
    { beat: "twist", narration: "The closet was empty. But on the screen, someone was standing right behind her.", visual: "Phone screen showing the woman's own bedroom with a tall dark silhouette standing behind her", animation: "silhouette slowly tilts its head, the lights flicker out", camera: "dolly-zoom", atmosphere: ["flicker", "shadows"], sfx: ["impact", "heartbeat"], transition: "fadeblack" },
    { beat: "ending", narration: `She never turned around. At ${time} the next night, the knocking came from her side of the door.`, visual: "Hallway at night seen from outside the bedroom, the door now closed, a hand print fogged on it", animation: "the fogged hand print slowly fades, light under the door dies", camera: "pull-out", atmosphere: ["fog"], sfx: ["knock", "wind"], transition: "fadeblack" },
  ];
  return {
    title: `The Knock at ${time}`,
    hook: beats[0].narration,
    concept: `A woman living alone hears knocking at the same time every night — and her phone reveals where it's coming from.`,
    characters: [{ id: "lead", name, ageRange: "late 20s", appearance: "slim young woman, pale olive skin", clothing: "oversized grey hoodie, dark sweatpants", hair: "shoulder-length messy black hair", face: "tired dark eyes, thin eyebrows", personality: "rational, stubborn, scared", voice: "soft, breathy", visualStyle: "dark cinematic realism" }],
    setting: place,
    musicMood: "suspense",
    scenes: beats,
  };
}

function love(seed: number, idea: string) {
  const her = pick(NAMES_F, seed);
  const him = pick(NAMES_M, seed, 3);
  const beats: Beat[] = [
    { beat: "hook", narration: `For three years, ${her} set two cups of coffee on the same café table.`, visual: `Cozy corner café at golden hour, two steaming cups on a small wooden table by the window, ${idea}`, animation: "steam curls from both cups, dust glows in sunbeams, passers-by blur outside", camera: "slow-push-in", atmosphere: ["dust"], sfx: ["city night"], transition: "dissolve" },
    { beat: "setup", narration: `It started when ${him} knocked hers over on a rainy Tuesday and bought her a new one.`, visual: `A young man, ${him}, laughing and apologizing, handing a woman, ${her}, a coffee cup at a café counter, rain on the window`, animation: "she smiles, their fingers touch on the cup, rain streaks down the glass", camera: "tracking", atmosphere: ["rain"], sfx: ["soft rain"], transition: "dissolve" },
    { beat: "escalation", narration: "Every Tuesday after that, the second cup was already waiting.", visual: `${her} and ${him} sitting across the café table, laughing, sunlight moving across them`, animation: "they lean closer as the light shifts from morning to evening", camera: "orbit", atmosphere: ["particles"], sfx: [], transition: "fade" },
    { beat: "twist", narration: `Then one Tuesday, ${him} didn't come. He had been offered a job across the ocean.`, visual: `${her} alone at the table, the second cup untouched and going cold, rain outside`, animation: "steam fades from the untouched cup, she glances at the door", camera: "pull-out", atmosphere: ["rain"], sfx: ["clock tick"], transition: "fadeblack" },
    { beat: "payoff", narration: "She kept ordering two cups anyway. Just in case.", visual: `Close-up of ${her}'s hands wrapped around a cup, a second cup across from her, seasons changing outside the window`, animation: "leaves fall then snow falls outside in a time-lapse", camera: "static", atmosphere: ["snow"], sfx: [], transition: "dissolve" },
    { beat: "ending", narration: "Three years later, a soaked stranger knocked her coffee over — and smiled like he'd practised.", visual: `${him}, older, soaked from rain, standing at the café table smiling at ${her}, spilled coffee between them`, animation: "she looks up, tears and a slow smile, warm light blooms", camera: "slow-push-in", atmosphere: ["rain"], sfx: ["soft rain"], transition: "fadeblack" },
  ];
  return {
    title: "Two Cups of Coffee",
    hook: beats[0].narration,
    concept: "A woman keeps a coffee ritual alive for someone who left — until he returns the way they met.",
    characters: [
      { id: "her", name: her, ageRange: "late 20s", appearance: "warm brown skin, petite", clothing: "cream knit sweater", hair: "long wavy dark hair", face: "soft features, dimples", personality: "loyal, hopeful", voice: "warm", visualStyle: "cinematic golden-hour realism" },
      { id: "him", name: him, ageRange: "about 30", appearance: "tall, light stubble", clothing: "navy rain jacket over white tee", hair: "short curly brown hair", face: "kind green eyes, crooked smile", personality: "clumsy, earnest", voice: "gentle", visualStyle: "cinematic golden-hour realism" },
    ],
    setting: "a small corner café in a rainy city",
    musicMood: "romantic",
    scenes: beats,
  };
}

function mystery(seed: number, idea: string) {
  const name = pick(NAMES_M, seed);
  const beats: Beat[] = [
    { beat: "hook", narration: "The house was empty. But dinner on the table was still warm.", visual: `An empty farmhouse kitchen at dusk, a set table with steaming plates, a chair pushed back, ${idea}`, animation: "steam rises from the plates, a pendant lamp sways slightly", camera: "slow-push-in", atmosphere: ["dust"], sfx: ["clock tick"], transition: "cut" },
    { beat: "setup", narration: `${name} was the first neighbour to walk in. The radio was still playing.`, visual: `A man, ${name}, stepping cautiously into the kitchen doorway holding a flashlight`, animation: "he sweeps the flashlight across the room, curtains move in a draft", camera: "tracking", atmosphere: ["shadows"], sfx: ["wind", "footsteps"], transition: "dissolve" },
    { beat: "escalation", narration: "Every clock in the house had stopped at 7:42.", visual: "Close-up of several wall clocks and a wristwatch on the table, all frozen at 7:42", animation: "second hands tremble but never move, dust floats", camera: "pan-right", atmosphere: ["dust"], sfx: ["clock tick"], transition: "cut" },
    { beat: "escalation", narration: "On the fridge, a note in the family's handwriting said: 'Don't wait for us. We found the door.'", visual: "A handwritten note pinned to an old fridge under a magnet, flashlight beam on it", animation: "the note flutters in a draft that has no source", camera: "slow-push-in", atmosphere: ["shadows"], sfx: ["wind"], transition: "cut" },
    { beat: "payoff", narration: "In the cellar, there was a door. It hadn't been there the day before.", visual: "Stone cellar with a tall old wooden door set into a wall, faint light leaking around its edges", animation: "light pulses softly around the door frame, dust drifts toward it", camera: "dolly-zoom", atmosphere: ["particles", "fog"], sfx: ["riser"], transition: "fadeblack" },
    { beat: "ending", narration: `${name} checked his watch. It had stopped at 7:42.`, visual: `Close-up of ${name}'s wristwatch frozen at 7:42 in the cellar light`, animation: "the second hand twitches once and stops, light flares from the door", camera: "static", atmosphere: ["particles"], sfx: ["impact"], transition: "fadeblack" },
  ];
  return {
    title: "The Door That Wasn't There",
    hook: beats[0].narration,
    concept: "A family vanishes mid-dinner, every clock frozen at the same minute, and a new door appears in the cellar.",
    characters: [{ id: "lead", name, ageRange: "40s", appearance: "broad-shouldered farmer", clothing: "worn canvas jacket, flannel shirt", hair: "greying short beard and hair", face: "weathered, deep-set eyes", personality: "careful, practical", voice: "low", visualStyle: "moody cinematic realism" }],
    setting: "a remote farmhouse at dusk",
    musicMood: "mysterious",
    scenes: beats,
  };
}

function motivation(seed: number, idea: string) {
  const name = pick(NAMES_M, seed, 5);
  const beats: Beat[] = [
    { beat: "hook", narration: "He failed the same exam four times. The fifth time, he stopped asking for luck.", visual: `A young man, ${name}, sitting on a bus stop bench at night holding a rejection letter, ${idea}`, animation: "letter trembles in the wind, streetlight flickers, breath in cold air", camera: "slow-push-in", atmosphere: ["dust"], sfx: ["wind"], transition: "cut" },
    { beat: "setup", narration: "Everyone told him to quit. Nobody saw what he did next.", visual: `${name} alone in a tiny room at 5 AM, desk lamp on, stacks of books`, animation: "he opens a book, clock ticks toward 5:01, steam from a mug", camera: "static", atmosphere: ["particles"], sfx: ["clock tick"], transition: "cut" },
    { beat: "escalation", narration: "Five in the morning. Every day. Rain, fever, holidays.", visual: `Montage-style shot of ${name} running in rain at dawn, then studying, then running again`, animation: "rain splashes under his shoes, pages flip fast, sunrise light sweeps", camera: "tracking", atmosphere: ["rain"], sfx: ["footsteps", "whoosh"], transition: "zoomin" },
    { beat: "payoff", narration: "On the fifth try, he didn't just pass. He came first.", visual: `${name} looking at a results board in a crowded hall, his name at the top`, animation: "the crowd blurs as he slowly smiles, confetti of light", camera: "dolly-zoom", atmosphere: ["particles"], sfx: ["impact", "riser"], transition: "fadeblack" },
    { beat: "ending", narration: "Discipline isn't punishment. It's what freedom costs.", visual: `${name} standing on a rooftop at sunrise over the city`, animation: "wind moves his jacket, the sun rises behind him", camera: "crane-up", atmosphere: ["dust"], sfx: ["wind"], transition: "fadeblack" },
  ];
  return {
    title: "Four Failures, One Habit",
    hook: beats[0].narration,
    concept: "An original composite story about failing repeatedly and winning through a daily habit.",
    characters: [{ id: "lead", name, ageRange: "early 20s", appearance: "lean, determined", clothing: "black hoodie, running shoes", hair: "short black hair", face: "sharp jaw, tired but focused eyes", personality: "stubborn, quiet", voice: "firm", visualStyle: "high-contrast cinematic" }],
    setting: "a cold city at dawn",
    musicMood: "epic",
    scenes: beats,
  };
}

function genericFiction(seed: number, idea: string, niche: NicheDefinition) {
  const name = pick(NAMES_F, seed, 9);
  const beats: Beat[] = [
    { beat: "hook", narration: `${name} woke up with a countdown glowing on her wrist. Nine minutes.`, visual: `A young woman, ${name}, in a futuristic bedroom, glowing blue numbers on her wrist, ${idea}`, animation: "numbers tick down, holographic dust swirls, she sits up startled", camera: "slow-push-in", atmosphere: ["particles"], sfx: ["riser"], transition: "cut" },
    { beat: "setup", narration: "Outside, everyone in the city had the same countdown.", visual: "Neon city street at night crowded with people all staring at glowing wrist timers", animation: "crowd murmurs, neon signs flicker, flying cars pass overhead", camera: "crane-up", atmosphere: ["fog", "particles"], sfx: ["city night"], transition: "dissolve" },
    { beat: "escalation", narration: "Nobody knew what happened at zero. The screens only said: stay where you are.", visual: "Giant building-sized screens showing the text STAY WHERE YOU ARE over the crowd", animation: "screens glitch, crowd surges, drones sweep searchlights", camera: "tracking", atmosphere: ["fog"], sfx: ["glitch", "whoosh"], transition: "cut" },
    { beat: "twist", narration: `${name} was the only one whose timer was counting up.`, visual: `Close-up of ${name}'s wrist, numbers now counting upward in gold`, animation: "blue numbers flip to gold and climb, light spills over her face", camera: "dolly-zoom", atmosphere: ["particles"], sfx: ["impact"], transition: "fadeblack" },
    { beat: "ending", narration: "At zero, the city went silent. And then it asked her what she wanted to do next.", visual: `The whole city frozen in golden light, ${name} standing alone in the middle of the street`, animation: "everything freezes except floating light, she looks up", camera: "pull-out", atmosphere: ["particles"], sfx: ["riser"], transition: "fadeblack" },
  ];
  return {
    title: "The Only Timer Counting Up",
    hook: beats[0].narration,
    concept: `Original ${niche.label.toLowerCase()} short: a city-wide countdown and one person who is different.`,
    characters: [{ id: "lead", name, ageRange: "mid 20s", appearance: "athletic young woman", clothing: "reflective silver jacket", hair: "short platinum bob", face: "freckles, bright amber eyes", personality: "curious, brave", voice: "clear", visualStyle: "neon sci-fi animation" }],
    setting: "a neon future city",
    musicMood: "epic",
    scenes: beats,
  };
}

function kids(seed: number, idea: string) {
  const beats: Beat[] = [
    { beat: "hook", narration: "One sunny morning, Pip the fox found something glowing in the grass.", visual: `A small friendly orange cartoon fox in a sunny meadow looking at a glowing pebble, ${idea}`, animation: "fox tilts head, tail wags, butterflies float by", camera: "slow-push-in", atmosphere: ["particles"], sfx: ["birds"], transition: "fade" },
    { beat: "setup", narration: "It was a tiny star that had fallen from the sky!", visual: "Cute tiny smiling star with sparkles resting in daisies, the fox leaning close", animation: "the star blinks and giggles, sparkles pop", camera: "static", atmosphere: ["particles"], sfx: ["chime"], transition: "slideleft" },
    { beat: "escalation", narration: "Pip carried the star up the tallest hill, step by step.", visual: "Cartoon fox carrying a glowing star up a grassy hill at sunset", animation: "fox hops up the hill, grass sways", camera: "tracking", atmosphere: [], sfx: ["footsteps"], transition: "fade" },
    { beat: "payoff", narration: "With one big hop, Pip lifted the star back into the sky.", visual: "Fox on hilltop lifting the star toward a purple twilight sky", animation: "star floats up and joins the others, sky twinkles", camera: "crane-up", atmosphere: ["particles"], sfx: ["chime", "whoosh"], transition: "circleopen" },
    { beat: "ending", narration: "And every night after, one little star twinkled just for Pip.", visual: "Fox curled up asleep on the hill under a starry sky, one star twinkling brighter", animation: "stars twinkle, fox breathes slowly", camera: "pull-out", atmosphere: ["particles"], sfx: [], transition: "fade" },
  ];
  return {
    title: "Pip and the Fallen Star",
    hook: beats[0].narration,
    concept: "A gentle fox helps a fallen star get home.",
    characters: [{ id: "pip", name: "Pip", ageRange: "young fox", appearance: "small round orange fox, white chest", clothing: "tiny green scarf", hair: "fluffy tail with white tip", face: "big friendly eyes, little smile", personality: "kind, brave", voice: "gentle", visualStyle: "soft storybook 3D" }],
    setting: "a sunny meadow",
    musicMood: "playful",
    scenes: beats,
  };
}

export function createTemplatePlan(niche: NicheDefinition, subNiche: string, idea: string, seed = Date.now()) {
  if (niche.fiction === "never") {
    throw new Error(`${niche.label} is a factual niche. Add a story model key (GROQ_API_KEY, GEMINI_API_KEY or OPENROUTER_API_KEY) so facts aren't invented by a template.`);
  }
  const hint = idea ? idea.slice(0, 120) : "";
  let story;
  if (niche.id === "horror" || subNiche === "horror") story = horror(seed, hint);
  else if (niche.id === "love" || subNiche === "romance") story = love(seed, hint);
  else if (niche.id === "mystery" || subNiche === "mystery") story = mystery(seed, hint);
  else if (niche.id === "motivation") story = motivation(seed, hint);
  else if (niche.id === "kids") story = kids(seed, hint);
  else story = genericFiction(seed, hint, niche);
  return {
    ...story,
    curiosityGap: "What is really happening — answered in the final scene.",
    ending: story.scenes[story.scenes.length - 1].narration,
    isFiction: true,
    seo: {},
  } as Record<string, unknown>;
}
