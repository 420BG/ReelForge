/**
 * Server-only text model access for the agent. Reuses the same providers, env names and
 * endpoints the existing app already uses (OpenRouter free router, Pollinations OpenAI-compatible).
 */

export type LlmResult = { json: Record<string, unknown>; model: string };

export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.replace(/```json|```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

async function call(provider: "openrouter" | "pollinations", system: string, user: string, maxTokens: number): Promise<LlmResult> {
  const key = provider === "openrouter" ? process.env.OPENROUTER_API_KEY : process.env.POLLINATIONS_API_KEY;
  if (!key) throw new Error(`${provider} not configured`);
  const url = provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://gen.pollinations.ai/v1/chat/completions";
  const model = provider === "openrouter" ? "openrouter/free" : "openai";
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Littleloop Shorts Agent" },
    body: JSON.stringify({ model, temperature: 0.85, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(process.env.VERCEL ? 60_000 : 75_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${provider} returned ${response.status}`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error(`${provider} returned no text`);
  const json = extractJson(content);
  if (!json) throw new Error(`${provider} returned invalid JSON`);
  return { json, model: `${provider}:${typeof data?.model === "string" ? data.model : model}` };
}

export function textModelConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.POLLINATIONS_API_KEY);
}

/** Tries OpenRouter's free router, then Pollinations. Throws if neither answers with JSON. */
export async function completeJson(system: string, user: string, maxTokens = 3500): Promise<LlmResult> {
  const errors: string[] = [];
  for (const provider of ["openrouter", "pollinations"] as const) {
    for (let attempt = 0; attempt < (process.env.VERCEL ? 1 : 2); attempt++) {
      try {
        return await call(provider, system, user, maxTokens);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        if (/not configured/.test(errors[errors.length - 1])) break;
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      }
    }
  }
  throw new Error(`No story model answered (${errors.join("; ")})`);
}
