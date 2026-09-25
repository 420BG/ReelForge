/* Registry of free AI providers. The pipeline walks each kind's list in
   order, skipping providers that are unconfigured or exhausted for the day —
   so when one quota runs out, the next one takes over automatically. */

export type ProviderKind = "script" | "image" | "voice" | "upload";

export interface ProviderMeta {
  id: string;
  kind: ProviderKind;
  name: string;
  freeLimit: string;
  resets: string;
  getKeyUrl: string | null; // null = no key needed
  envKey: string | null; // env var that configures it
  note: string;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "groq",
    kind: "script",
    name: "Groq (Llama 3.3 70B)",
    freeLimit: "~1,000 req/day",
    resets: "Midnight UTC",
    getKeyUrl: "https://console.groq.com/keys",
    envKey: "GROQ_API_KEY",
    note: "Fastest free LLM on the planet. No credit card.",
  },
  {
    id: "gemini",
    kind: "script",
    name: "Google Gemini 2.0 Flash",
    freeLimit: "~1,500 req/day",
    resets: "Midnight Pacific",
    getKeyUrl: "https://aistudio.google.com/apikey",
    envKey: "GEMINI_API_KEY",
    note: "Huge free tier, 1M-token context.",
  },
  {
    id: "openrouter",
    kind: "script",
    name: "OpenRouter free models",
    freeLimit: "~50 req/day",
    resets: "Daily",
    getKeyUrl: "https://openrouter.ai/keys",
    envKey: "OPENROUTER_API_KEY",
    note: "Rotating pool of :free community models.",
  },
  {
    id: "local",
    kind: "script",
    name: "Forge engine (built in)",
    freeLimit: "Unlimited",
    resets: "—",
    getKeyUrl: null,
    envKey: null,
    note: "Template pipeline baked into this server. Never runs out.",
  },
  {
    id: "pollinations",
    kind: "image",
    name: "Pollinations.ai",
    freeLimit: "Free, rate-limited",
    resets: "Per-second",
    getKeyUrl: null,
    envKey: null,
    note: "Free AI image generation. No key, no account.",
  },
  {
    id: "pexels",
    kind: "image",
    name: "Pexels stock",
    freeLimit: "200 req/hour",
    resets: "Hourly",
    getKeyUrl: "https://www.pexels.com/api/",
    envKey: "PEXELS_API_KEY",
    note: "Real photography instead of AI art.",
  },
  {
    id: "local-scenes",
    kind: "image",
    name: "Scene bank (built in)",
    freeLimit: "Unlimited",
    resets: "—",
    getKeyUrl: null,
    envKey: null,
    note: "Curated cinematic plates shipped with the app.",
  },
  {
    id: "streamelements",
    kind: "voice",
    name: "Polly voices (StreamElements)",
    freeLimit: "Free endpoint",
    resets: "—",
    getKeyUrl: null,
    envKey: null,
    note: "Amazon Polly neural voices over a free relay.",
  },
  {
    id: "google-tts",
    kind: "voice",
    name: "Google TTS relay",
    freeLimit: "Free endpoint",
    resets: "—",
    getKeyUrl: null,
    envKey: null,
    note: "Translate-voice endpoint used as a fallback narrator.",
  },
  {
    id: "youtube",
    kind: "upload",
    name: "YouTube Data API",
    freeLimit: "10,000 units/day (~6 uploads)",
    resets: "Midnight Pacific",
    getKeyUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    envKey: "GOOGLE_CLIENT_ID",
    note: "Uploads cost 1,600 quota units each. Free forever.",
  },
];

export function providersByKind(kind: ProviderKind): ProviderMeta[] {
  return PROVIDERS.filter((p) => p.kind === kind);
}

export function isConfigured(p: ProviderMeta): boolean {
  if (p.id === "youtube") {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }
  if (p.envKey) return Boolean(process.env[p.envKey]);
  return true;
}
