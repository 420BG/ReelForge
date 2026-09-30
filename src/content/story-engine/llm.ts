import { isExhausted, looksLikeQuotaError, markCall, markFailure } from "@/lib/pipeline/usage";

/**
 * Server-only text model access for the agent. Uses the SAME providers, env names and
 * daily-quota tracking as ReelForge's script pipeline: Groq → Gemini → OpenRouter,
 * plus Pollinations text when a POLLINATIONS_API_KEY is present.
 */

export type LlmResult = { json: Record<string, unknown>; model: string };

export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.replace(/```json|```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

type Provider = { id: string; model: string; enabled: () => boolean; call: (system: string, user: string, maxTokens: number) => Promise<{ status: number; text: string; content?: string }> };

const timeout = () => AbortSignal.timeout(process.env.VERCEL ? 60_000 : 75_000);

async function chatCompletions(url: string, key: string, model: string, system: string, user: string, maxTokens: number, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ model, temperature: 0.85, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }], ...extra }),
    signal: timeout(),
    cache: "no-store",
  });
  const text = await response.text();
  let content: string | undefined;
  try { content = JSON.parse(text)?.choices?.[0]?.message?.content; } catch { /* keep undefined */ }
  return { status: response.status, text, content };
}

const PROVIDERS: Provider[] = [
  {
    id: "groq", model: "llama-3.3-70b-versatile", enabled: () => Boolean(process.env.GROQ_API_KEY),
    call: (s, u, m) => chatCompletions("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY!, "llama-3.3-70b-versatile", s, u, m, { response_format: { type: "json_object" } }),
  },
  {
    id: "gemini", model: "gemini-2.0-flash", enabled: () => Boolean(process.env.GEMINI_API_KEY),
    call: async (s, u, m) => {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: s }] }, contents: [{ parts: [{ text: u }] }], generationConfig: { temperature: 0.85, maxOutputTokens: m, responseMimeType: "application/json" } }),
        signal: timeout(),
        cache: "no-store",
      });
      const text = await response.text();
      let content: string | undefined;
      try { content = JSON.parse(text)?.candidates?.[0]?.content?.parts?.[0]?.text; } catch { /* keep undefined */ }
      return { status: response.status, text, content };
    },
  },
  {
    id: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", enabled: () => Boolean(process.env.OPENROUTER_API_KEY),
    call: (s, u, m) => chatCompletions("https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY!, "meta-llama/llama-3.3-70b-instruct:free", s, u, m, {}, { "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000", "X-Title": "ReelForge Agent" }),
  },
  {
    id: "pollinations-text", model: "openai", enabled: () => Boolean(process.env.POLLINATIONS_API_KEY),
    call: (s, u, m) => chatCompletions("https://gen.pollinations.ai/v1/chat/completions", process.env.POLLINATIONS_API_KEY!, "openai", s, u, m),
  },
];

export function textModelConfigured() {
  return PROVIDERS.some((provider) => provider.enabled());
}

/** Walks the provider chain (skipping unconfigured / exhausted ones). Throws if none answers with JSON. */
export async function completeJson(system: string, user: string, maxTokens = 3500): Promise<LlmResult> {
  const errors: string[] = [];
  for (const provider of PROVIDERS) {
    if (!provider.enabled()) continue;
    if (await isExhausted(provider.id)) { errors.push(`${provider.id}: daily quota used`); continue; }
    try {
      const result = await provider.call(system, user, maxTokens);
      if (result.status !== 200) {
        await markFailure(provider.id, looksLikeQuotaError(result.status, result.text));
        errors.push(`${provider.id}: HTTP ${result.status}`);
        continue;
      }
      const json = result.content ? extractJson(result.content) : null;
      if (!json) { await markFailure(provider.id); errors.push(`${provider.id}: invalid JSON`); continue; }
      await markCall(provider.id);
      return { json, model: `${provider.id}:${provider.model}` };
    } catch (error) {
      await markFailure(provider.id);
      errors.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No story model answered (${errors.join("; ") || "none configured"})`);
}
