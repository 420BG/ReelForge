import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";
import type { StyleId } from "@/lib/generator";
import { captionChunks, estimateSceneDuration, formatSrtTime } from "./script";

export interface SceneMedia {
  text: string;
  imgPath: string;
  audioPath: string | null;
}

export interface RenderResult {
  videoRel: string;
  thumbRel: string;
  durationSec: number;
}

/* Vercel's filesystem is read-only except /tmp — use that in production
   as scratch space; the final render gets uploaded to Supabase Storage
   afterward, so nothing here needs to persist between invocations. */
export const STORAGE = process.env.VERCEL
  ? path.join("/tmp", "storage")
  : path.join(process.cwd(), "storage");
const FPS = 24;

export async function ensureStorage() {
  await fs.mkdir(path.join(STORAGE, "renders"), { recursive: true });
  await fs.mkdir(path.join(STORAGE, "videos"), { recursive: true });
  await fs.mkdir(path.join(STORAGE, "fonts"), { recursive: true });
}

/* Build-time bundlers can bake in wrong absolute paths for these binaries —
   resolve the first candidate that actually exists on disk at runtime. */
function resolveBin(kind: "ffmpeg" | "ffprobe"): string {
  const fromPkg =
    kind === "ffmpeg"
      ? (ffmpegPath as unknown as string)
      : (ffprobePath as unknown as { path: string })?.path;
  const envOverride =
    kind === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  const candidates = [
    envOverride,
    fromPkg,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(
      process.cwd(),
      "node_modules",
      "ffprobe-static",
      "bin",
      process.platform,
      process.arch === "x64" ? "x64" : "arm64",
      kind === "ffprobe" ? "ffprobe" : kind,
    ),
    "/app/node_modules/ffmpeg-static/ffmpeg",
    "/app/node_modules/ffprobe-static/bin/linux/x64/ffprobe",
    kind,
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* next candidate */
    }
  }
  return kind;
}

function run(cmd: string, args: string[], timeoutMs = 10 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: timeoutMs });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-900)}`));
    });
  });
}

async function probeDuration(file: string): Promise<number | null> {
  try {
    const out = await run(
      resolveBin("ffprobe"),
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      30_000,
    );
    const d = parseFloat(out.trim());
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

const FONT_URLS: { url: string; file: string; family: string }[] = [
  {
    url: "https://raw.githubusercontent.com/google/fonts/main/apache/robotocondensed/RobotoCondensed%5Bwght%5D.ttf",
    file: "RobotoCondensed.ttf",
    family: "Roboto Condensed",
  },
  {
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf",
    file: "ArchivoBlack.ttf",
    family: "Archivo Black",
  },
];

async function ensureFonts(): Promise<{ fontDir: string; family: string } | null> {
  const fontDir = path.join(STORAGE, "fonts");
  for (const f of FONT_URLS) {
    const p = path.join(fontDir, f.file);
    if (!existsSync(p)) {
      try {
        const res = await fetch(f.url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 20_000) await fs.writeFile(p, buf);
        else continue;
      } catch {
        continue;
      }
    }
    if (existsSync(p)) return { fontDir, family: f.family };
  }
  return null;
}

function styleFilter(style: string): string {
  switch (style as StyleId) {
    case "neon":
      return "eq=saturation=1.55:contrast=1.15";
    case "retro":
      return "eq=saturation=0.85:contrast=1.05,vignette=PI/5";
    case "mono":
      return "hue=s=0,eq=contrast=1.25";
    default:
      return "eq=saturation=1.1:contrast=1.06,vignette=PI/4";
  }
}

function assTime(sec: number): string {
  const cs = Math.round(Math.max(0, sec) * 100);
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6_000);
  const s = Math.floor((cs % 6_000) / 100);
  const r = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(2, "0")}`;
}

function assEscape(text: string): string {
  return text.replace(/[{}\\]/g, "").replace(/\n/g, "\\N");
}

function buildAss(opts: {
  W: number;
  H: number;
  family: string;
  scenes: { text: string; duration: number }[];
  format: "short" | "long";
}): string {
  const fontSize = opts.format === "short" ? 60 : 44;
  const marginV = opts.format === "short" ? Math.round(opts.H * 0.29) : 130;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${opts.W}
PlayResY: ${opts.H}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${opts.family},${fontSize},&H00FFFFFF,&H000000FF,&H90000000,&H64000000,-1,0,0,0,100,100,1.5,0,1,5,0,2,36,36,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  const lines: string[] = [];
  let offset = 0;
  for (const scene of opts.scenes) {
    for (const chunk of captionChunks(scene.text, scene.duration)) {
      lines.push(
        `Dialogue: 0,${assTime(offset + chunk.start)},${assTime(offset + chunk.end)},Cap,,0,0,0,,${assEscape(chunk.text)}`,
      );
    }
    offset += scene.duration;
  }
  return `${header}\n${lines.join("\n")}\n`;
}

export async function renderVideo(opts: {
  videoId: string;
  format: "short" | "long";
  style: string;
  scenes: SceneMedia[];
}): Promise<RenderResult> {
  await ensureStorage();
  const ffmpeg = resolveBin("ffmpeg");
  const workDir = path.join(STORAGE, "videos", opts.videoId);
  await fs.mkdir(workDir, { recursive: true });

  const W = opts.format === "short" ? 720 : 1280;
  const H = opts.format === "short" ? 1280 : 720;
  const fonts = await ensureFonts();

  // resolve durations from real narration, with script-based fallback
  const durations = await Promise.all(
    opts.scenes.map(async (s) => {
      if (s.audioPath) {
        const d = await probeDuration(s.audioPath);
        if (d) return d + 0.45;
      }
      return estimateSceneDuration(s.text);
    }),
  );

  // 1) encode every scene as a uniform mp4 (ken burns + grade, no text)
  const sceneFiles: string[] = [];
  for (let i = 0; i < opts.scenes.length; i++) {
    const scene = opts.scenes[i];
    const dur = Math.max(1.6, durations[i]);
    durations[i] = dur;
    const frames = Math.ceil(dur * FPS);

    const filters = [
      `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2}`,
      i % 2 === 0
        ? `zoompan=z='1+0.2*on/${frames}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS}`
        : `zoompan=z='1.25-0.2*on/${frames}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS}`,
      styleFilter(opts.style),
      "format=yuv420p",
    ];

    const scriptPath = path.join(workDir, `scene_${i}.ffs`);
    await fs.writeFile(scriptPath, `[0:v]${filters.join(",")}[v];[1:a]apad=pad_dur=0.45,atrim=duration=${dur.toFixed(2)}[a]`);

    const sceneOut = path.join(workDir, `scene_${i}.mp4`);
    const audioInput = scene.audioPath
      ? ["-i", scene.audioPath]
      : ["-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=channel_layout=mono:sample_rate=44100"];
    await run(ffmpeg, [
      "-y",
      "-loop", "1", "-framerate", String(FPS), "-t", (dur + 0.1).toFixed(2), "-i", scene.imgPath,
      ...audioInput,
      "-/filter_complex", scriptPath,
      "-map", "[v]", "-map", "[a]",
      "-t", dur.toFixed(2),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-r", String(FPS),
      "-c:a", "aac", "-b:a", "128k",
      sceneOut,
    ]);
    sceneFiles.push(sceneOut);
  }

  // 2) concat
  const total = durations.reduce((a, b) => a + b, 0);
  const listPath = path.join(workDir, "concat.txt");
  await fs.writeFile(
    listPath,
    sceneFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  const joined = path.join(workDir, "joined.mp4");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", joined]);

  // 3) caption sidecars: ASS for burn-in + SRT as a soft track
  const sceneDurations = opts.scenes.map((s, i) => ({ text: s.text, duration: durations[i] }));
  let offset = 0;
  const srtBlocks: string[] = [];
  let n = 1;
  for (const sd of sceneDurations) {
    for (const c of captionChunks(sd.text, sd.duration)) {
      srtBlocks.push(
        `${n++}\n${formatSrtTime(offset + c.start)} --> ${formatSrtTime(offset + c.end)}\n${c.text}\n`,
      );
    }
    offset += sd.duration;
  }
  const srtPath = path.join(workDir, "subs.srt");
  await fs.writeFile(srtPath, srtBlocks.join("\n"));

  // 4) final pass: burn karaoke captions via libass + mux the soft track
  const videoRel = path.join("renders", `${opts.videoId}.mp4`);
  const finalPath = path.join(STORAGE, videoRel);
  if (fonts) {
    const assPath = path.join(workDir, "subs.ass");
    await fs.writeFile(
      assPath,
      buildAss({ W, H, family: fonts.family, scenes: sceneDurations, format: opts.format }),
    );
    const vf = `ass='${assPath.replace(/'/g, "'\\''")}':fontsdir='${fonts.fontDir}'`;
    await run(ffmpeg, [
      "-y", "-i", joined, "-i", srtPath,
      "-vf", vf,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
      "-c:a", "copy", "-c:s", "mov_text",
      "-metadata:s:s:0", "language=eng",
      "-movflags", "+faststart",
      finalPath,
    ]);
  } else {
    // no font available — soft subtitles only
    await run(ffmpeg, [
      "-y", "-i", joined, "-i", srtPath,
      "-c", "copy", "-c:s", "mov_text",
      "-metadata:s:s:0", "language=eng",
      "-movflags", "+faststart",
      finalPath,
    ]);
  }

  // 5) thumbnail
  const thumbRel = path.join("renders", `${opts.videoId}.jpg`);
  try {
    await fs.copyFile(opts.scenes[0].imgPath, path.join(STORAGE, thumbRel));
  } catch {
    /* non-fatal */
  }

  return { videoRel, thumbRel, durationSec: Math.round(total) };
}
