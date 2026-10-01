/**
 * Current text-model IDs for each free provider, newest first.
 * Providers retire model names regularly (Groq dropped Llama 3.3 70B on 2026-08-16,
 * Google shut down gemini-2.0-flash on 2026-06-01), so callers try these in order and
 * move to the next one when a name comes back "not found". Set e.g. GROQ_MODEL in Vercel
 * to force a specific model without a code change.
 */
const LISTS: Record<string, { env: string; models: string[] }> = {
  groq: { env: "GROQ_MODEL", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile"] },
  gemini: { env: "GEMINI_MODEL", models: ["gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"] },
  openrouter: { env: "OPENROUTER_MODEL", models: ["openrouter/free", "google/gemma-4-31b-it:free", "qwen/qwen3.8-27b:free", "nvidia/nemotron-3-super-120b-a12b:free"] },
  cerebras: { env: "CEREBRAS_MODEL", models: ["gpt-oss-120b", "qwen-3-235b-a22b-instruct-2507", "llama-3.3-70b"] },
  mistral: { env: "MISTRAL_MODEL", models: ["mistral-small-latest", "mistral-medium-latest"] },
  sambanova: { env: "SAMBANOVA_MODEL", models: ["gpt-oss-120b", "DeepSeek-V3.1", "Meta-Llama-3.3-70B-Instruct"] },
  "cloudflare-ai": { env: "CLOUDFLARE_TEXT_MODEL", models: ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"] },
  "github-models": { env: "GITHUB_MODELS_MODEL", models: ["openai/gpt-4.1-mini", "openai/gpt-4o-mini"] },
  nvidia: { env: "NVIDIA_MODEL", models: ["meta/llama-3.3-70b-instruct", "openai/gpt-oss-120b", "qwen/qwen3-235b-a22b", "deepseek-ai/deepseek-v3.1"] },
  huggingface: { env: "HF_TEXT_MODEL", models: ["openai/gpt-oss-120b", "meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen3-235B-A22B-Instruct-2507"] },
  cohere: { env: "COHERE_MODEL", models: ["command-a-03-2025", "command-r-plus-08-2024"] },
};

/** The model that last worked for each provider in this server instance (tried first next time). */
const lastGood = new Map<string, string>();

export function modelCandidates(provider: string): string[] {
  const list = LISTS[provider];
  if (!list) return [];
  const override = process.env[list.env]?.trim();
  const ordered = [lastGood.get(provider), override, ...list.models].filter((m): m is string => Boolean(m));
  return Array.from(new Set(ordered));
}

export function primaryModel(provider: string): string {
  return modelCandidates(provider)[0] ?? "";
}

export function rememberModel(provider: string, model: string) {
  lastGood.set(provider, model);
}

/** True when an error response means "this model name doesn't exist / was retired". */
export function isModelGone(status: number, body: string): boolean {
  if (status === 404) return true;
  if (status !== 400 && status !== 410 && status !== 422) return false;
  return /model|decommission|deprecat|not[ _-]?found|does not exist|no endpoints|unsupported/i.test(body);
}
