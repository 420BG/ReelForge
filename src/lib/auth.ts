/* Session signing that works in both the edge middleware and Node runtime. */

export const SESSION_COOKIE = "rf_session";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function appPassword(): string {
  return process.env.APP_PASSWORD ?? "reelforge";
}

/* Key is only enforced when APP_PASSWORD is explicitly set in the env.
   Without it, the gate is a single "Unlock" tap. */
export function authRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appPassword()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return hex(sig);
}

export async function createSessionValue(): Promise<string> {
  const ts = Date.now().toString();
  const sig = await hmac(ts);
  return `${ts}.${sig}`;
}

export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  try {
    if (!value) return false;
    const dot = value.lastIndexOf(".");
    if (dot <= 0) return false;
    const ts = value.slice(0, dot);
    const sig = value.slice(dot + 1);
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Date.now() - tsNum > MAX_AGE_MS) return false;
    const expected = await hmac(ts);
    return expected === sig;
  } catch {
    // never let a crypto quirk 500 the whole app
    return false;
  }
}
