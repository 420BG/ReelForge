import type { CaptionSettings } from "@/content/types";

/** Builds an ASS subtitle file (libass) with mobile-first styling for 1080×1920. */

export type CaptionCue = { text: string; start: number; duration: number };

function assColor(hex: string, alpha = 0) {
  const clean = /^#?[0-9a-f]{6}$/i.test(hex) ? hex.replace("#", "") : "FFFFFF";
  const [r, g, b] = [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 6)];
  return `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${b}${g}${r}`.toUpperCase();
}

function time(seconds: number) {
  const value = Math.max(0, seconds);
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);
  const cs = Math.floor((value - Math.floor(value)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();
}

/** Splits narration into short readable chunks (≤3 words, ≤20 chars where possible). */
export function chunkWords(text: string) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    const candidate = [...current, word];
    const long = candidate.join(" ").length > 20;
    const endsSentence = /[.!?…]$/.test(current[current.length - 1] ?? "");
    if (current.length && (candidate.length > 3 || long || endsSentence)) { chunks.push(current); current = [word]; }
    else current = candidate;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function buildCaptionEvents(cue: CaptionCue, settings: CaptionSettings) {
  const chunks = chunkWords(cue.text);
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.join(" ").length + 2, 0) || 1;
  let cursor = cue.start;
  const lines: string[] = [];
  for (const chunk of chunks) {
    const phrase = chunk.join(" ");
    const span = Math.max(0.28, (cue.duration * (phrase.length + 2)) / totalChars);
    const start = cursor;
    const end = Math.min(cue.start + cue.duration + 0.15, cursor + span);
    cursor += span;
    let body = escapeAss(phrase);
    if (settings.animation === "pop") body = `{\\fscx72\\fscy72\\t(0,110,\\fscx108\\fscy108)\\t(110,190,\\fscx100\\fscy100)}${body}`;
    else if (settings.animation === "fade") body = `{\\fad(90,60)}${body}`;
    else if (settings.animation === "karaoke") {
      const wordChars = chunk.reduce((sum, word) => sum + word.length + 1, 0) || 1;
      body = chunk.map((word) => `{\\k${Math.max(8, Math.round(((end - start) * 100 * (word.length + 1)) / wordChars))}}${escapeAss(word)}`).join(" ");
    }
    lines.push(`Dialogue: 1,${time(start)},${time(end)},Caption,,0,0,0,,${body}`);
  }
  return lines;
}

export function buildAss(cues: CaptionCue[], settings: CaptionSettings, fontFamily: string, hook?: { text: string; until: number }, dims: { width: number; height: number } = { width: 1080, height: 1920 }) {
  const landscape = dims.width > dims.height;
  // Landscape (long videos): smaller type, lower third, wider side margins.
  const size = Math.round(Math.max(48, Math.min(140, Math.round(settings.size))) * (landscape ? 0.78 : 1));
  const alignment = settings.position === "top" ? 8 : settings.position === "center" ? 5 : 2;
  const marginV = settings.position === "center" ? 0 : settings.position === "top" ? (landscape ? 70 : 300) : landscape ? 95 : 380;
  const sideMargin = landscape ? 220 : 70;
  const karaoke = settings.animation === "karaoke";
  const primary = karaoke ? assColor(settings.highlight) : assColor(settings.color);
  const secondary = karaoke ? assColor(settings.color) : assColor(settings.highlight);
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${dims.width}`,
    `PlayResY: ${dims.height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,${fontFamily},${size},${primary},${secondary},&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,8,3,${alignment},${sideMargin},${sideMargin},${marginV},1`,
    `Style: Hook,${fontFamily},${Math.round(size * 1.05)},${assColor(settings.highlight)},${assColor(settings.color)},&H00000000,&H64000000,-1,0,0,0,100,100,1,0,1,6,2,8,80,80,${landscape ? 90 : 250},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events: string[] = [];
  if (hook && settings.hookTitle && hook.text.trim()) {
    events.push(`Dialogue: 2,${time(0)},${time(hook.until)},Hook,,0,0,0,,{\\fad(120,200)\\fscx85\\fscy85\\t(0,180,\\fscx100\\fscy100)}${escapeAss(hook.text.toUpperCase())}`);
  }
  for (const cue of cues) if (cue.text.trim()) events.push(...buildCaptionEvents(cue, settings));
  return `${header.join("\n")}\n${events.join("\n")}\n`;
}
