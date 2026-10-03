import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NicheDefinition } from "@/content/niches/registry";
import type { AtmosphereFx, CameraMove, CaptionSettings, MusicMood, TransitionKind } from "@/content/types";
import { atmospherePostFilter, gradeFilter, XFADE, zoompanFor } from "@/video/animation";
import { isAmbient, renderMusic, renderSfx, resolveSfx } from "@/video/audio/synth";
import { buildAss, type CaptionCue } from "@/video/captions";
import { captionFonts, probe, runFfmpeg } from "@/video/composition/ffmpeg";

/**
 * Final assembly: per-scene 1080×1920 segments → xfade transitions → burned-in captions
 * → voice + ducked music + SFX mix → loudness-normalised H.264/AAC MP4 with faststart.
 */

export const OUTPUT = { width: 1080, height: 1920, fps: 30 } as const;
export type Dims = { width: number; height: number; fps: number };
/** 9:16 renders at 1080×1920, 16:9 at 1920×1080. Accepts an aspect ("9:16"/"16:9") or, for older callers, a format ("short"/"long"). */
export function dimsFor(shape: "short" | "long" | "9:16" | "16:9" | undefined): Dims {
  return shape === "long" || shape === "16:9" ? { width: 1920, height: 1080, fps: 30 } : { ...OUTPUT };
}

export type ComposeScene = {
  index: number;
  kind: "video" | "image";
  source: string;
  camera: CameraMove;
  atmosphere: AtmosphereFx[];
  transition: TransitionKind;
  narration: string;
  caption: string;
  voiceFile: string | null;
  voiceDuration: number;
  plannedDuration: number;
  sfx: string[];
};

export type ComposeInput = {
  workDir: string;
  scenes: ComposeScene[];
  grade: NicheDefinition["colorGrade"];
  ambience: string[];
  captions: CaptionSettings;
  captionsEnabled: boolean;
  hookText: string;
  coverTitle: string;
  musicMood: MusicMood | null;
  musicVolume: number;
  sfxEnabled: boolean;
  quality: "draft" | "production";
  maxDuration: number;
  outFile: string;
  coverFile: string;
  onProgress?: (label: string) => Promise<void> | void;
  /** Output size (default 1080×1920). */
  dims?: Dims;
  /** Long videos render in parts: music + loudness are applied once over the joined parts instead. */
  partMode?: boolean;
  /** Ceiling for the video bitrate (kbit/s) so the finished file fits the storage file-size limit. */
  videoKbps?: number;
  /** Audio bitrate (kbit/s); default 192. */
  audioKbps?: number;
};

/** Captions are laid out for 1080p and scaled by libass, so they look the same at any output size. */
const designDims = (dims: Dims) => (dims.width > dims.height ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 });

export type TimelineEntry = { index: number; start: number; length: number; transitionOut: number; voiceStart: number; voiceDuration: number };

export function buildTimeline(scenes: Pick<ComposeScene, "voiceDuration" | "plannedDuration" | "transition" | "voiceFile">[]): { entries: TimelineEntry[]; total: number } {
  const entries: TimelineEntry[] = [];
  let start = 0;
  scenes.forEach((scene, i) => {
    const last = i === scenes.length - 1;
    const incoming = i === 0 ? 0 : entries[i - 1].transitionOut;
    const lead = i === 0 ? 0.12 : Math.max(0.15, incoming * 0.6);
    const spoken = scene.voiceFile ? scene.voiceDuration : 0;
    const body = Math.max(scene.voiceFile ? lead + spoken + 0.35 : scene.plannedDuration, 2.2);
    let transitionOut = last ? 0 : XFADE[scene.transition]?.seconds ?? 0.4;
    const length = body + transitionOut + (last ? 0.7 : 0);
    transitionOut = Math.min(transitionOut, length / 3);
    entries.push({ index: i, start, length, transitionOut, voiceStart: start + lead, voiceDuration: spoken });
    start += length - transitionOut;
  });
  const lastEntry = entries[entries.length - 1];
  return { entries, total: lastEntry ? lastEntry.start + lastEntry.length : 0 };
}

function overlayChain(fx: AtmosphereFx[], seconds: number, inputLabel: string, outLabel: string, extraInputIndex: number, dims: Dims = OUTPUT) {
  // IMAGE MODE only: procedural weather layers so stills are not static.
  const kind = fx.includes("rain") ? "rain" : fx.includes("snow") ? "snow" : fx.includes("fog") || fx.includes("smoke") ? "fog" : fx.includes("dust") || fx.includes("particles") ? "dust" : null;
  if (!kind) return { filter: `[${inputLabel}]null[${outLabel}]`, input: null as string[] | null };
  const landscape = dims.width > dims.height;
  const size = kind === "fog" ? (landscape ? "44x24" : "24x44") : landscape ? "960x540" : "540x960";
  const full = `${dims.width}:${dims.height}`;
  const input = ["-f", "lavfi", "-i", `color=c=0x808080:s=${size}:r=${dims.fps}:d=${seconds.toFixed(2)}`];
  const src = `[${extraInputIndex}:v]`;
  let layer: string;
  let opacity: number;
  if (kind === "rain") { layer = `${src}noise=alls=100:allf=t,lutyuv=y='if(gt(val,247),255,16)':u=128:v=128,avgblur=sizeX=1:sizeY=12,lutyuv=y='clip((val-16)*9,0,255)',scale=${full}`; opacity = 0.3; }
  else if (kind === "snow") { layer = `${src}noise=alls=100:allf=t,lutyuv=y='if(gt(val,250),255,16)':u=128:v=128,gblur=sigma=1.5,lutyuv=y='clip((val-16)*5,0,255)',scale=${full}`; opacity = 0.45; }
  else if (kind === "dust") { layer = `${src}noise=alls=100:allf=t,lutyuv=y='if(gt(val,252),230,16)':u=128:v=128,gblur=sigma=1.2,lutyuv=y='clip((val-16)*4,0,255)',scale=${full}`; opacity = 0.4; }
  else { layer = `${src}noise=alls=100:allf=0,scale=${full}:flags=bicubic,gblur=sigma=30,lutyuv=y='clip((val-80)*1.3,0,255)':u=128:v=128,scroll=horizontal=0.0015`; opacity = 0.25; }
  return {
    filter: `${layer},format=yuv420p[fx${outLabel}];[${inputLabel}]format=yuv420p[base${outLabel}];[base${outLabel}][fx${outLabel}]blend=c0_mode=screen:c0_opacity=${opacity}:c1_opacity=0:c2_opacity=0[${outLabel}]`,
    input,
  };
}

async function renderSegment(scene: ComposeScene, length: number, grade: string, out: string, OUTPUT: Dims) {
  const post = [grade, atmospherePostFilter(scene.atmosphere)].filter((item) => item && item !== "null").join(",");
  const frames = Math.round(length * OUTPUT.fps);
  const bigW = Math.round(OUTPUT.width * 1.5);
  const bigH = Math.round(OUTPUT.height * 1.5);
  const args: string[] = [];
  let graph: string;
  if (scene.kind === "video") {
    const info = await probe(scene.source);
    const clip = Math.max(0.5, info.duration || 5);
    const slow = Math.min(Math.max(length / clip, 1), 1.6);
    args.push("-stream_loop", "-1", "-i", scene.source);
    graph = `[0:v]setpts=${slow.toFixed(4)}*PTS,scale=${OUTPUT.width}:${OUTPUT.height}:force_original_aspect_ratio=increase,crop=${OUTPUT.width}:${OUTPUT.height},fps=${OUTPUT.fps},setsar=1${post ? `,${post}` : ""},format=yuv420p[v]`;
  } else {
    args.push("-loop", "1", "-framerate", String(OUTPUT.fps), "-t", length.toFixed(3), "-i", scene.source);
    const motion = `${zoompanFor(scene.camera, frames)}:d=1:s=${OUTPUT.width}x${OUTPUT.height}:fps=${OUTPUT.fps}`;
    const overlay = overlayChain(scene.atmosphere, length, "moved", "wx", 1, OUTPUT);
    if (overlay.input) args.push(...overlay.input);
    graph = `[0:v]scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,crop=${bigW}:${bigH},${motion},setsar=1[moved];${overlay.filter};[wx]${post || "null"},format=yuv420p[v]`;
  }
  // Intermediate file: high quality, but never bigger than ~36 MB (storage accepts 50 MB per file on free plans).
  const segKbps = Math.max(600, Math.min(10_000, Math.floor((36_000 * 8) / Math.max(1, length))));
  args.push("-filter_complex", graph, "-map", "[v]", "-t", length.toFixed(3), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-maxrate", `${segKbps}k`, "-bufsize", `${segKbps * 2}k`, "-pix_fmt", "yuv420p", "-r", String(OUTPUT.fps), out);
  await runFfmpeg(args, 270_000);
}

async function licensedMusic(mood: MusicMood): Promise<string | null> {
  const root = process.env.AGENT_MUSIC_DIR;
  if (!root) return null;
  try {
    const dir = path.join(root, mood);
    const files = (await readdir(dir)).filter((name) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(name));
    return files.length ? path.join(dir, files[Math.floor(Math.random() * files.length)]) : null;
  } catch { return null; }
}

export type ComposeResult = { duration: number; warnings: string[]; timeline: TimelineEntry[] };

/**
 * Plans the timeline once. If narration overruns the target, voices are sped up (max ×1.15);
 * the factor is part of the plan so per-scene segments rendered in separate requests line up.
 */
export function planTimeline(scenes: Pick<ComposeScene, "voiceDuration" | "plannedDuration" | "transition" | "voiceFile">[], maxDuration: number) {
  const warnings: string[] = [];
  let voiceFactor = 1;
  let plan = buildTimeline(scenes);
  const voiced = scenes.some((scene) => scene.voiceFile);
  if (plan.total > maxDuration && voiced) {
    voiceFactor = Math.min(1.15, plan.total / maxDuration + 0.02);
    plan = buildTimeline(scenes.map((scene) => ({ ...scene, voiceDuration: scene.voiceDuration / voiceFactor })));
    warnings.push(`Narration sped up ×${voiceFactor.toFixed(2)} to fit ${maxDuration}s.`);
  }
  if (plan.total > maxDuration + 0.5) warnings.push(`Final length ${plan.total.toFixed(1)}s exceeds the ${maxDuration}s target.`);
  return { ...plan, voiceFactor, warnings };
}

/** Renders ONE scene segment (no audio). Safe to run in its own serverless request. */
export async function renderSceneSegment(scene: ComposeScene, length: number, grade: NicheDefinition["colorGrade"], out: string, dims: Dims = OUTPUT) {
  await renderSegment(scene, length, gradeFilter(grade), out, dims);
}

export type FinalInput = ComposeInput & { segments: string[] };

/** Final pass: transitions + captions + voice/music/SFX mix + encode + cover, from pre-rendered segments. */
export async function composeFinal(input: FinalInput): Promise<ComposeResult> {
  const { workDir } = input;
  const OUTPUT = input.dims ?? dimsFor("short");
  const partMode = Boolean(input.partMode);
  if (!input.scenes.length || input.segments.length !== input.scenes.length) throw new Error("Segments are missing for some scenes.");
  const planned = planTimeline(input.scenes, input.maxDuration);
  const warnings = [...planned.warnings];
  const { entries, total } = planned;
  const scenes = input.scenes.map((scene) => ({ ...scene }));
  const voiced = scenes.filter((scene) => scene.voiceFile);
  if (planned.voiceFactor > 1) {
    for (const scene of voiced) {
      const faster = path.join(workDir, `voice-fast-${scene.index}.mp3`);
      await runFfmpeg(["-i", scene.voiceFile!, "-af", `atempo=${planned.voiceFactor.toFixed(3)}`, "-c:a", "libmp3lame", "-b:a", "160k", faster], 60_000);
      scene.voiceFile = faster;
      scene.voiceDuration = scene.voiceDuration / planned.voiceFactor;
    }
  }
  const segments = input.segments;
  // 2) Captions
  await input.onProgress?.("Captions and audio");
  const fonts = await captionFonts(path.join(workDir, "fonts"));
  const family = input.captions.font !== "auto" && fonts.available.includes(input.captions.font) ? input.captions.font : fonts.family;
  const cues: CaptionCue[] = scenes.map((scene, i) => ({
    text: scene.voiceFile ? scene.narration : scene.caption || scene.narration,
    start: entries[i].voiceStart,
    duration: scene.voiceFile ? entries[i].voiceDuration : Math.max(1, entries[i].length - entries[i].transitionOut - 0.3),
  }));
  const hookUntil = Math.min(2.8, entries[0].length - 0.1);
  await writeFile(path.join(workDir, "captions.ass"), input.captionsEnabled ? buildAss(cues, input.captions, family, { text: input.hookText, until: hookUntil }, designDims(OUTPUT)) : buildAss([], { ...input.captions, hookTitle: false }, family, undefined, designDims(OUTPUT)));

  // 3) Audio stems
  const audioInputs: { file: string; delay: number; role: "voice" | "music" | "sfx"; volume: number }[] = [];
  scenes.forEach((scene, i) => { if (scene.voiceFile) audioInputs.push({ file: scene.voiceFile, delay: entries[i].voiceStart, role: "voice", volume: 1 }); });
  if (!partMode && input.musicMood && input.musicVolume > 0) {
    const licensed = await licensedMusic(input.musicMood);
    const musicFile = licensed ?? path.join(workDir, "music.wav");
    if (!licensed) await renderMusic(input.musicMood, total, musicFile);
    audioInputs.push({ file: musicFile, delay: 0, role: "music", volume: (input.musicVolume / 100) * (voiced.length ? 0.9 : 1.2) });
  }
  if (input.sfxEnabled) {
    let n = 0;
    const place = async (label: string, at: number, seconds: number, volume: number) => {
      const id = resolveSfx(label);
      if (!id || n >= 24) return;
      const file = path.join(workDir, `sfx-${n++}.wav`);
      await renderSfx(id, seconds, file);
      audioInputs.push({ file, delay: Math.max(0, at), role: "sfx", volume });
    };
    for (const label of input.ambience.slice(0, 2)) await place(label, 0, total, 0.35);
    for (const [i, scene] of scenes.entries()) {
      const entry = entries[i];
      for (const [k, label] of scene.sfx.entries()) {
        const id = resolveSfx(label);
        if (!id) { warnings.push(`No synthesized sound for "${label}" (scene ${i + 1}); skipped.`); continue; }
        await place(label, entry.start + (isAmbient(id) ? 0 : 0.25 + k * 0.45), isAmbient(id) ? entry.length : 4, isAmbient(id) ? 0.45 : 0.7);
      }
      if (i < scenes.length - 1 && ["slideleft", "slideup", "zoomin", "wipeleft"].includes(scene.transition)) await place("whoosh", entry.start + entry.length - entry.transitionOut - 0.25, 0.85, 0.5);
    }
  }

  // 4) Final graph
  await input.onProgress?.("Final encode");
  const args: string[] = [];
  segments.forEach((segment) => args.push("-i", segment));
  audioInputs.forEach((audio) => args.push("-i", audio.file));
  const graph: string[] = [];
  let videoLabel = "[0:v]";
  if (segments.length > 1) {
    let offset = 0;
    for (let i = 1; i < segments.length; i++) {
      const prev = entries[i - 1];
      offset += prev.length - prev.transitionOut;
      const name = XFADE[scenes[i - 1].transition]?.name ?? "fade";
      const out = `[x${i}]`;
      graph.push(`${videoLabel}[${i}:v]xfade=transition=${name}:duration=${Math.max(0.04, prev.transitionOut).toFixed(3)}:offset=${offset.toFixed(3)}${out}`);
      videoLabel = out;
    }
  }
  graph.push(`${videoLabel}ass=captions.ass:fontsdir=fonts,format=yuv420p[vout]`);

  const base = segments.length;
  const voices = audioInputs.map((audio, k) => ({ ...audio, label: `${base + k}:a` })).filter((audio) => audio.role === "voice");
  const music = audioInputs.map((audio, k) => ({ ...audio, label: `${base + k}:a` })).find((audio) => audio.role === "music");
  const sfx = audioInputs.map((audio, k) => ({ ...audio, label: `${base + k}:a` })).filter((audio) => audio.role === "sfx");
  const prep = (audio: { label: string; delay: number; volume: number }, name: string, loop = false) =>
    `[${audio.label}]aresample=48000,aformat=channel_layouts=stereo${loop ? `,aloop=loop=-1:size=2000000000` : ""},atrim=0:${(total + 1).toFixed(2)},adelay=${Math.round(audio.delay * 1000)}:all=1,volume=${audio.volume.toFixed(3)}[${name}]`;
  const mixParts: string[] = [];
  if (voices.length) {
    voices.forEach((voice, k) => graph.push(prep(voice, `v${k}`)));
    graph.push(`${voices.map((_, k) => `[v${k}]`).join("")}amix=inputs=${voices.length}:normalize=0:duration=longest,asplit=2[voice][voicesc]`);
    mixParts.push("[voice]");
  }
  if (music) {
    graph.push(prep(music, "mus", true));
    if (voices.length) { graph.push(`[mus][voicesc]sidechaincompress=threshold=0.025:ratio=7:attack=15:release=350[duck]`); mixParts.push("[duck]"); }
    else mixParts.push("[mus]");
  } else if (voices.length) graph.push(`[voicesc]anullsink`);
  if (sfx.length) {
    sfx.forEach((effect, k) => graph.push(prep(effect, `s${k}`)));
    graph.push(`${sfx.map((_, k) => `[s${k}]`).join("")}amix=inputs=${sfx.length}:normalize=0:duration=longest[fx]`);
    mixParts.push("[fx]");
  }
  if (mixParts.length) graph.push(`${mixParts.join("")}amix=inputs=${mixParts.length}:normalize=0:duration=longest,apad,atrim=0:${total.toFixed(3)}${partMode ? "" : `,afade=t=out:st=${Math.max(0, total - 0.6).toFixed(3)}:d=0.6,loudnorm=I=-14:TP=-1.5:LRA=11`},aresample=48000[aout]`);
  else graph.push(`anullsrc=r=48000:cl=stereo,atrim=0:${total.toFixed(3)}[aout]`);

  const fast = input.quality === "draft" || Boolean(process.env.VERCEL);
  // The bitrate ceiling keeps the finished file inside the storage size limit (long videos get a lower ceiling).
  const ceiling = Math.max(150, Math.min(input.quality === "draft" ? 4000 : 4800, Math.floor(input.videoKbps ?? Infinity)));
  const preset = ["-preset", fast ? "veryfast" : "medium", "-crf", input.quality === "draft" ? "24" : "20", "-maxrate", `${ceiling}k`, "-bufsize", `${ceiling * 2}k`];
  args.push(
    "-filter_complex", graph.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", ...preset, "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(OUTPUT.fps),
    "-c:a", "aac", "-b:a", `${input.audioKbps ?? 192}k`, "-ar", "48000",
    "-t", total.toFixed(3), "-movflags", "+faststart", path.resolve(input.outFile),
  );
  await runFfmpeg(args.map((arg) => (arg.startsWith(workDir) ? path.relative(workDir, arg) : arg)), 280_000, workDir);

  // 5) Cover image: first scene frame + title
  if (!input.coverFile) return { duration: total, warnings, timeline: entries };
  try {
    const coverAss = buildAss([], { ...input.captions, hookTitle: true, size: 104 }, family, { text: input.coverTitle, until: 5 }, designDims(OUTPUT)).replace(/,(250|90),1\n/, `,${Math.round(designDims(OUTPUT).height * 0.375)},1\n`);
    await writeFile(path.join(workDir, "cover.ass"), coverAss);
    await runFfmpeg(["-i", path.relative(workDir, segments[0]), "-ss", Math.min(1.2, entries[0].length / 2).toFixed(2), "-frames:v", "1", "-vf", "ass=cover.ass:fontsdir=fonts", "-q:v", "3", path.resolve(input.coverFile)], 60_000, workDir);
  } catch (error) {
    warnings.push(`Cover image failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
  return { duration: total, warnings, timeline: entries };
}

/** Convenience for a persistent server/tests: all segments then the final pass, in one call. */
export async function compose(input: ComposeInput): Promise<ComposeResult> {
  if (!input.scenes.length) throw new Error("No scenes to compose.");
  const { entries } = planTimeline(input.scenes, input.maxDuration);
  const segments: string[] = [];
  for (const [i, scene] of input.scenes.entries()) {
    await input.onProgress?.(`Rendering scene ${i + 1}/${input.scenes.length}`);
    const out = path.join(input.workDir, `seg-${i}.mp4`);
    await renderSceneSegment(scene, entries[i].length, input.grade, out, input.dims);
    segments.push(out);
  }
  return composeFinal({ ...input, segments });
}

/**
 * Long videos: joins the rendered parts (same codec settings → stream copy for video), then lays one
 * continuous generated music bed under the whole thing (ducked under the voice) and normalises loudness.
 * Audio-only processing, so it stays fast even for 10+ minute videos.
 */
export async function assembleParts(input: { workDir: string; parts: string[]; musicMood: MusicMood | null; musicVolume: number; outFile: string; audioKbps?: number; onProgress?: (label: string) => Promise<void> | void }) {
  const { workDir } = input;
  const list = path.join(workDir, "parts.txt");
  await writeFile(list, input.parts.map((file) => `file '${path.resolve(file).replace(/'/g, "'\\''")}'`).join("\n"));
  // One pass straight from the parts into the final file (no joined copy on disk): the scratch disk on
  // serverless is small, and a long video must not need three copies of itself.
  let total = 0;
  for (const file of input.parts) total += (await probe(file)).duration;
  const args = ["-f", "concat", "-safe", "0", "-i", list];
  let graph: string;
  if (input.musicMood && input.musicVolume > 0) {
    await input.onProgress?.("Joining parts, music bed and loudness");
    const licensed = await licensedMusic(input.musicMood);
    // Generated music is rendered once (≤ 2 min) and looped, instead of one huge WAV for the whole video.
    const musicFile = licensed ?? path.join(workDir, "music.wav");
    if (!licensed) await renderMusic(input.musicMood, Math.min(total, 120), musicFile);
    args.push("-stream_loop", "-1", "-i", musicFile);
    const vol = ((input.musicVolume / 100) * 0.9).toFixed(3);
    graph = `[0:a]aresample=48000,asplit=2[main][sc];[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},volume=${vol}[mus];[mus][sc]sidechaincompress=threshold=0.025:ratio=7:attack=15:release=350[duck];[main][duck]amix=inputs=2:normalize=0:duration=first,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(3)}:d=1.5,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`;
  } else {
    await input.onProgress?.("Joining parts");
    graph = `[0:a]afade=t=out:st=${Math.max(0, total - 1.5).toFixed(3)}:d=1.5,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`;
  }
  await runFfmpeg([...args, "-filter_complex", graph, "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", `${input.audioKbps ?? 192}k`, "-ar", "48000", "-t", total.toFixed(3), "-movflags", "+faststart", path.resolve(input.outFile)], 280_000, workDir);
  const info = await probe(path.resolve(input.outFile));
  return { duration: info.duration || total };
}
