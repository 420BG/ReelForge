import fs from "node:fs/promises";
import path from "node:path";
import { NICHES, type NicheId } from "@/lib/generator";
import { isExhausted, markCall, markFailure } from "./usage";

/* Free scene imagery: Pollinations AI art → Pexels stock → built-in bank. */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function keywords(text: string): string {
  return text
    .replace(/[^a-zA-Z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 3)
    .join(" ");
}

async function fetchBuffer(url: string, headers: Record<string, string> = {}, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (!type.includes("image")) throw new Error(`not an image (${type})`);
    if (buf.length < 8_000) throw new Error("image too small");
    return buf;
  } finally {
    clearTimeout(id);
  }
}

function dims(format: "short" | "long") {
  return format === "short" ? { w: 720, h: 1280, orient: "portrait" } : { w: 1280, h: 720, orient: "landscape" };
}

export async function sceneImage(opts: {
  sceneText: string;
  niche: NicheId | "custom";
  format: "short" | "long";
  index: number;
  videoId: string;
  workDir: string;
}): Promise<{ imgPath: string; provider: string }> {
  const niche = NICHES.find((n) => n.id === opts.niche);
  const nicheLabel = niche?.label ?? "cinematic";
  const kws = keywords(opts.sceneText) || nicheLabel;
  const { w, h, orient } = dims(opts.format);
  const seed = hash(opts.videoId + opts.index) % 99999;
  const out = path.join(opts.workDir, `scene_${opts.index}.jpg`);

  // 1) Pollinations — free AI art, no key
  if (!(await isExhausted("pollinations"))) {
    try {
      const prompt = `${nicheLabel} themed cinematic film still about ${kws}, dramatic volumetric lighting, ultra detailed, moody, ${orient} composition`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`;
      const buf = await fetchBuffer(url);
      await fs.writeFile(out, buf);
      await markCall("pollinations");
      return { imgPath: out, provider: "pollinations" };
    } catch (err) {
      await markFailure("pollinations", String(err).includes("429"));
      console.error("pollinations failed:", err);
    }
  }

  // 2) Pexels — real photography, free key
  if (process.env.PEXELS_API_KEY && !(await isExhausted("pexels"))) {
    try {
      const q = encodeURIComponent(`${nicheLabel} ${kws}`);
      const url = `https://api.pexels.com/v1/search?query=${q}&orientation=${orient}&per_page=1&page=${(seed % 5) + 1}`;
      const res = await fetch(url, {
        headers: { Authorization: process.env.PEXELS_API_KEY },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const src: string | undefined =
        data.photos?.[0]?.src?.large2x ?? data.photos?.[0]?.src?.large;
      if (!src) throw new Error("no photos");
      const buf = await fetchBuffer(src);
      await fs.writeFile(out, buf);
      await markCall("pexels");
      return { imgPath: out, provider: "pexels" };
    } catch (err) {
      await markFailure("pexels", String(err).includes("429"));
      console.error("pexels failed:", err);
    }
  }

  // 3) built-in cinematic scene bank — never runs out
  const local = path.join(process.cwd(), "public", niche?.img ?? NICHES[seed % NICHES.length].img);
  await fs.copyFile(local, out);
  return { imgPath: out, provider: "local-scenes" };
}
