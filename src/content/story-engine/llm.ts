import { isModelGone, modelCandidates, rememberModel } from "@/lib/models";
import { isExhausted, looksLikeQuotaError, markCall, markFailure } from "@/lib/pipeline/usage";

/**
 * Server-only text model access for the agent. Uses the SAME providers, env names and
 * daily-quota tracking as ReelForge's script pipeline: Groq → Gemini → OpenRouter, then any
 * extra free tiers you add keys for (Cerebras, Mistral, SambaNova, Cloudflare Workers AI,
 * GitHub Models), Pollinations text, and finally Pollinations' key-less endpoint.
 * A provider that hits its daily quota is skipped until the next UTC day.
 */

export type LlmResult = { json: Record<string, unknown>; model: string };

export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.replace(/```json|```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

type CallResult = { status: number; text: string; content?: string };
type Provider = { id: string; enabled: () => boolean; call: (model: string, system: string, user: string, maxTokens: number, json: boolean) => Promise<CallResult> };

const timeout = () => AbortSignal.timeout(process.env.VERCEL ? 60_000 : 75_000);

async function chatCompletions(url: string, key: string, model: string, system: string, user: string, maxTokens: number, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Promise<CallResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ model, temperature: 0.85, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }], ...extra }),
    signal: timeout(),
    cache: "no-store",
  });
  const text = await response.text();
  let content: string | undefined;
  try { content = JSON.parse(text)?.choices?.[0]?.message?.content; } catch { /* keep undefined */ }
  return { status: response.status, text, content };
}

const jsonMode = (on: boolean) => (on ? { response_format: { type: "json_object" } } : {});
// Reasoning models (gpt-oss etc.) spend tokens thinking before they answer — give them room.
const room = (maxTokens: number) => Math.max(maxTokens, 6000);

const PROVIDERS: Provider[] = [
  {
    id: "groq", enabled: () => Boolean(process.env.GROQ_API_KEY),
    call: (model, s, u, m, json) => chatCompletions("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY!, model, s, u, room(m), jsonMode(json)),
  },
  {
    id: "gemini", enabled: () => Boolean(process.env.GEMINI_API_KEY),
    call: async (model, s, u, m, json) => {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: s }] }, contents: [{ parts: [{ text: u }] }], generationConfig: { temperature: 0.85, maxOutputTokens: Math.max(m, 8192), ...(json ? { responseMimeType: "application/json" } : {}) } }),
        signal: timeout(),
        cache: "no-store",
      });
      const text = await response.text();
      let content: string | undefined;
      try { content = (JSON.parse(text)?.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string; thought?: boolean }) => (part.thought ? "" : part.text ?? "")).join(""); } catch { /* keep undefined */ }
      return { status: response.status, text, content };
    },
  },
  {
    id: "openrouter", enabled: () => Boolean(process.env.OPENROUTER_API_KEY),
    call: (model, s, u, m) => chatCompletions("https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY!, model, s, u, room(m), {}, { "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000", "X-Title": "ReelForge Agent" }),
  },
  // ---- extra free tiers (all optional; add the env var in Vercel to switch one on) ----
  {
    id: "cerebras", enabled: () => Boolean(process.env.CEREBRAS_API_KEY),
    call: (model, s, u, m, json) => chatCompletions("https://api.cerebras.ai/v1/chat/completions", process.env.CEREBRAS_API_KEY!, model, s, u, room(m), jsonMode(json)),
  },
  {
    id: "mistral", enabled: () => Boolean(process.env.MISTRAL_API_KEY),
    call: (model, s, u, m, json) => chatCompletions("https://api.mistral.ai/v1/chat/completions", process.env.MISTRAL_API_KEY!, model, s, u, m, jsonMode(json)),
  },
  {
    id: "sambanova", enabled: () => Boolean(process.env.SAMBANOVA_API_KEY),
    call: (model, s, u, m) => chatCompletions("https://api.sambanova.ai/v1/chat/completions", process.env.SAMBANOVA_API_KEY!, model, s, u, room(m)),
  },
  {
    id: "cloudflare-ai", enabled: () => cloudflareConfigured(),
    call: (model, s, u, m) => chatCompletions(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`, process.env.CLOUDFLARE_API_TOKEN!, model, s, u, room(m)),
  },
  {
    id: "github-models", enabled: () => Boolean(process.env.GITHUB_MODELS_TOKEN),
    call: (model, s, u, m) => chatCompletions("https://models.github.ai/inference/chat/completions", process.env.GITHUB_MODELS_TOKEN!, model, s, u, Math.min(m, 4000)),
  },
  {
    id: "nvidia", enabled: () => Boolean(process.env.NVIDIA_API_KEY),
    call: (model, s, u, m) => chatCompletions("https://integrate.api.nvidia.com/v1/chat/completions", process.env.NVIDIA_API_KEY!, model, s, u, room(m)),
  },
  {
    id: "huggingface", enabled: () => Boolean(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
    call: (model, s, u, m) => chatCompletions("https://router.huggingface.co/v1/chat/completions", (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY)!, model, s, u, room(m)),
  },
  {
    id: "cohere", enabled: () => Boolean(process.env.COHERE_API_KEY),
    call: (model, s, u, m) => chatCompletions("https://api.cohere.ai/compatibility/v1/chat/completions", process.env.COHERE_API_KEY!, model, s, u, Math.min(m, 4000)),
  },
  {
    id: "pollinations-text", enabled: () => Boolean(process.env.POLLINATIONS_API_KEY),
    call: (_model, s, u, m) => chatCompletions("https://gen.pollinations.ai/v1/chat/completions", process.env.POLLINATIONS_API_KEY!, "openai", s, u, m),
  },
  {
    // Key-less community endpoint: last resort, can be slow or rate-limited. Turn off with POLLINATIONS_KEYLESS_TEXT=off.
    id: "pollinations-free-text", enabled: () => process.env.POLLINATIONS_KEYLESS_TEXT !== "off",
    call: (_model, s, u, m) => chatCompletions("https://text.pollinations.ai/openai", "", "openai", s, u, m),
  },
];

/**
 * Per-minute rate limits (plain 429) only pause a provider briefly in this server instance;
 * a provider is skipped for the rest of the UTC day only when the error says the daily quota is used.
 */
const cooldownUntil = new Map<string, number>();
const DAILY_QUOTA = /per[ -]?day|daily|quota|RPD|TPD|exceeded your|insufficient|credits|billing/i;

const modelsFor = (provider: Provider) => {
  const list = modelCandidates(provider.id);
  return list.length ? list : ["openai"];
};

export function cloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

/** True when at least one KEYED model is set up (the key-less fallback alone doesn't count for factual niches). */
export function textModelConfigured() {
  return PROVIDERS.some((provider) => provider.id !== "pollinations-free-text" && provider.enabled());
}

/** Any model at all, including the key-less fallback (fine for fiction; factual niches still need a keyed one). */
export function textModelAvailable() {
  return PROVIDERS.some((provider) => provider.enabled());
}

/** Which script models are switched on, for the Settings page (names only — never values). */
export function textModelStatus() {
  return PROVIDERS.map((provider) => ({ id: provider.id, model: modelsFor(provider)[0], configured: provider.enabled() }));
}

/** Walks the provider chain (skipping unconfigured / exhausted ones). Throws if none answers with JSON. */
export async function completeJson(system: string, user: string, maxTokens = 3500): Promise<LlmResult> {
  const errors: string[] = [];
  for (const provider of PROVIDERS) {
    if (!provider.enabled()) continue;
    if (await isExhausted(provider.id)) { errors.push(`${provider.id}: daily quota used`); continue; }
    if ((cooldownUntil.get(provider.id) ?? 0) > Date.now()) { errors.push(`${provider.id}: rate-limited, cooling down`); continue; }
    let lastError = "";
    for (const model of modelsFor(provider).slice(0, 4)) {
      try {
        let result = await provider.call(model, system, user, maxTokens, true);
        // Some models reject JSON mode — retry once without it.
        if (result.status === 400 && /response_format|json_object|json mode|responseMimeType|response_mime_type/i.test(result.text)) result = await provider.call(model, system, user, maxTokens, false);
        if (result.status !== 200) {
          if (isModelGone(result.status, result.text)) { lastError = `${model} retired/not found`; continue; }
          const limited = looksLikeQuotaError(result.status, result.text) || result.status === 402;
          const daily = limited && (result.status === 402 || DAILY_QUOTA.test(result.text));
          if (limited && !daily) cooldownUntil.set(provider.id, Date.now() + 60_000);
          await markFailure(provider.id, daily);
          lastError = `HTTP ${result.status}`;
          break;
        }
        const json = result.content ? extractJson(result.content) : null;
        if (!json) { lastError = `${model}: invalid JSON`; continue; }
        rememberModel(provider.id, model);
        await markCall(provider.id);
        return { json, model: `${provider.id}:${model}` };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        break;
      }
    }
    if (lastError) { errors.push(`${provider.id}: ${lastError}`); if (!/HTTP|quota/.test(lastError)) await markFailure(provider.id); }
  }
  throw new Error(`No story model answered (${errors.join("; ") || "none configured"})`);
}
