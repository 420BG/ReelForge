import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

/** Same resolution order ReelForge's renderer uses (env → package → node_modules → system). */
function resolveBin(kind: "ffmpeg" | "ffprobe"): string {
  const fromPkg = kind === "ffmpeg" ? (ffmpegStatic as unknown as string) : (ffprobeStatic as unknown as { path: string })?.path;
  const candidates = [
    kind === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH,
    fromPkg,
    kind === "ffmpeg"
      ? path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg")
      : path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch === "x64" ? "x64" : "arm64", "ffprobe"),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try { if (existsSync(candidate)) return candidate; } catch { /* next */ }
  }
  return kind;
}

let ffmpegCache: string | null = null;
let ffprobeCache: string | null = null;
export const FFMPEG = () => (ffmpegCache ??= resolveBin("ffmpeg"));
export const FFPROBE = () => (ffprobeCache ??= resolveBin("ffprobe"));

export class FfmpegError extends Error {
  readonly stderr: string;
  constructor(message: string, stderr: string) { super(message); this.stderr = stderr; }
}

/** Runs ffmpeg with an argument array (never a shell string) and a hard timeout. */
export function runFfmpeg(args: string[], timeoutMs = 10 * 60_000, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"], cwd });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-6000); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new FfmpegError("ffmpeg timed out", stderr)); }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new FfmpegError((error as NodeJS.ErrnoException).code === "ENOENT" ? "ffmpeg is not available (Vercel: install the ffmpeg-static package; elsewhere: install ffmpeg)." : error.message, stderr));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new FfmpegError(`ffmpeg exited with code ${code}: ${stderr.split("\n").filter(Boolean).slice(-3).join(" | ")}`, stderr));
    });
  });
}

/** Runs ffmpeg at info log level and returns its stderr (for analysis filters such as silencedetect). */
export function ffmpegReport(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG(), ["-hide_banner", "-nostats", "-loglevel", "info", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-2_000_000); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new FfmpegError("ffmpeg timed out", stderr.slice(-2000))); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); reject(new FfmpegError(error.message, stderr.slice(-2000))); });
    child.on("close", (code) => { clearTimeout(timer); if (code === 0) resolve(stderr); else reject(new FfmpegError(`ffmpeg exited with code ${code}`, stderr.slice(-2000))); });
  });
}

export type ProbeResult = { duration: number; width: number | null; height: number | null; videoCodec: string | null; audioCodec: string | null; hasVideo: boolean; hasAudio: boolean };

function probeWithFfprobe(file: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    execFile(FFPROBE(), ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height", "-of", "json", file], { timeout: 30_000 }, (error, stdout) => {
      if (error) { reject(error); return; }
      try {
        const data = JSON.parse(stdout);
        const streams = Array.isArray(data.streams) ? data.streams : [];
        const video = streams.find((stream: { codec_type?: string }) => stream.codec_type === "video");
        const audio = streams.find((stream: { codec_type?: string }) => stream.codec_type === "audio");
        resolve({
          duration: Number(data.format?.duration) || 0,
          width: video?.width ?? null,
          height: video?.height ?? null,
          videoCodec: video?.codec_name ?? null,
          audioCodec: audio?.codec_name ?? null,
          hasVideo: Boolean(video),
          hasAudio: Boolean(audio),
        });
      } catch (parseError) { reject(parseError); }
    });
  });
}

/** Parses `ffmpeg -i <file>` output. Used where ffprobe isn't installed. */
export function parseFfmpegInfo(stderr: string): ProbeResult {
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const videoLine = /Stream #[^\n]*?Video:\s*([a-z0-9_]+)[^\n]*/i.exec(stderr);
  const size = videoLine ? /,\s*(\d{2,5})x(\d{2,5})[\s,\[]/.exec(videoLine[0]) : null;
  const audioLine = /Stream #[^\n]*?Audio:\s*([a-z0-9_]+)/i.exec(stderr);
  return {
    duration: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    videoCodec: videoLine ? videoLine[1] : null,
    audioCodec: audioLine ? audioLine[1] : null,
    hasVideo: Boolean(videoLine),
    hasAudio: Boolean(audioLine),
  };
}

function probeWithFfmpeg(file: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG(), ["-hide_banner", "-i", file], { timeout: 30_000 }, (error, _stdout, stderr) => {
      // ffmpeg exits non-zero when no output is given; that's expected here.
      const text = String(stderr ?? "");
      if (!/Duration:|Stream #/.test(text)) { reject(new Error(`Could not read media info: ${(error?.message ?? text).slice(0, 200)}`)); return; }
      resolve(parseFfmpegInfo(text));
    });
  });
}

let ffprobeWorks: boolean | null = null;
export async function probe(file: string): Promise<ProbeResult> {
  if (ffprobeWorks !== false) {
    try { const result = await probeWithFfprobe(file); ffprobeWorks = true; return result; }
    catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") ffprobeWorks = false;
      else if (ffprobeWorks) throw new Error(`ffprobe failed: ${error instanceof Error ? error.message : error}`);
      else ffprobeWorks = false;
    }
  }
  return probeWithFfmpeg(file);
}

export async function ffmpegAvailable() {
  try { await runFfmpeg(["-f", "lavfi", "-i", "anullsrc", "-t", "0.05", "-f", "null", "-"], 15_000); return true; } catch { return false; }
}

/* ---------- Fonts for burned-in captions ---------- */

const FONT_CANDIDATES = [
  path.join(process.cwd(), "assets", "fonts", "DejaVuSans-Bold.ttf"),
  "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf",
  "/usr/share/fonts/truetype/google-fonts/Montserrat-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
];

let fontSources: { file: string; family: string }[] | null = null;

function familyFromFile(file: string) {
  const base = path.basename(file).replace(/\.(ttf|otf)$/i, "").replace(/[-_](Bold|Black|ExtraBold|SemiBold|Regular|Medium|Heavy).*$/i, "");
  if (/^DejaVuSans$/i.test(base)) return "DejaVu Sans";
  if (/^LiberationSans$/i.test(base)) return "Liberation Sans";
  if (/^FreeSans$/i.test(base)) return "FreeSans";
  return base.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function fcScanFamily(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("fc-scan", ["--format", "%{family[0]}", file], { timeout: 5000 }, (error, stdout) => resolve(error ? null : stdout.trim() || null));
  });
}

async function findNixFont(): Promise<string | null> {
  try {
    const entries = await readdir("/nix/store");
    for (const entry of entries) {
      if (!/-dejavu-fonts-[\d.]+$/.test(entry)) continue;
      for (const sub of ["share/fonts/truetype/DejaVuSans-Bold.ttf", "share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]) {
        const file = path.join("/nix/store", entry, sub);
        try { if ((await stat(file)).isFile()) return file; } catch { /* keep looking */ }
      }
    }
  } catch { /* not a nix system */ }
  return null;
}

/**
 * Copies bold font(s) into a private fonts dir that libass loads via `fontsdir`, so captions render
 * even where fontconfig knows no fonts (Vercel, bare containers). The repo ships DejaVu Sans Bold.
 */
export async function captionFonts(fontsDir: string) {
  if (!fontSources) {
    const files: string[] = [];
    if (process.env.AGENT_FONT_FILE) files.push(process.env.AGENT_FONT_FILE);
    for (const file of FONT_CANDIDATES) {
      try { if ((await stat(/*turbopackIgnore: true*/ file)).isFile()) files.push(file); } catch { /* missing */ }
    }
    if (!files.length) { const nix = await findNixFont(); if (nix) files.push(nix); }
    if (!files.length) throw new Error("No font found for captions. Keep assets/fonts/DejaVuSans-Bold.ttf in the repo or set AGENT_FONT_FILE.");
    const sources: { file: string; family: string }[] = [];
    for (const file of Array.from(new Set(files))) sources.push({ file, family: (await fcScanFamily(file)) || familyFromFile(file) });
    fontSources = sources;
  }
  await mkdir(fontsDir, { recursive: true });
  for (const source of fontSources) {
    try { await copyFile(source.file, path.join(fontsDir, path.basename(source.file))); } catch { /* skip unreadable font */ }
  }
  const available = Array.from(new Set(fontSources.map((source) => source.family)));
  return { dir: fontsDir, family: available[0] ?? "DejaVu Sans", available };
}
