import fs from "node:fs/promises";
import { isExhausted, markCall, markFailure } from "./usage";
import type { VoiceId } from "@/lib/generator";

/* Free neural narration. StreamElements relays Amazon Polly voices; Google
   translate's voice endpoint is the fallback. Both are key-less GET APIs. */

const VOICE_MAP: Record<VoiceId, string> = {
  nova: "Joanna",
  atlas: "Brian",
  orion: "Matthew",
  lyra: "Emma",
  sage: "Amy",
};

async function download(url: string, timeoutMs = 20_000): Promise<Buffer> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) throw new Error("audio too small");
    if (!type.includes("audio") && !type.includes("mpeg") && !type.includes("octet-stream")) {
      throw new Error(`unexpected content-type ${type}`);
    }
    return buf;
  } finally {
    clearTimeout(id);
  }
}

async function viaStreamElements(text: string, voiceId: VoiceId): Promise<Buffer> {
  const voice = VOICE_MAP[voiceId] ?? "Brian";
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`;
  return download(url);
}

function chunkText(text: string, max = 180): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) chunks.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function viaGoogle(text: string): Promise<Buffer> {
  const parts = chunkText(text);
  const buffers: Buffer[] = [];
  for (const part of parts) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(part)}`;
    buffers.push(await download(url));
  }
  return Buffer.concat(buffers); // raw mp3 frame concat
}

export async function narrate(
  text: string,
  voiceId: VoiceId,
  outPath: string,
): Promise<{ provider: string | null }> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { provider: null };

  const chain: { id: string; run: () => Promise<Buffer> }[] = [
    { id: "streamelements", run: () => viaStreamElements(clean, voiceId) },
    { id: "google-tts", run: () => viaGoogle(clean) },
  ];

  for (const p of chain) {
    if (await isExhausted(p.id)) continue;
    try {
      const buf = await p.run();
      await fs.writeFile(outPath, buf);
      await markCall(p.id);
      return { provider: p.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const quota = msg.includes("429") || msg.includes("403");
      await markFailure(p.id, quota);
      console.error(`tts provider ${p.id} failed:`, msg);
    }
  }
  return { provider: null };
}
