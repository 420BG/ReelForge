import { stat } from "node:fs/promises";
import { probe } from "@/video/composition/ffmpeg";
import { OUTPUT } from "@/video/composition/compose";

export type ValidationReport = { ok: boolean; errors: string[]; warnings: string[]; duration: number; width: number | null; height: number | null; sizeBytes: number };

/** Checks the final file is a real, playable 1080×1920 H.264/AAC MP4 within the Shorts limit. */
export async function validateFinal(file: string, opts: { maxDuration: number; expectAudio: boolean }): Promise<ValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sizeBytes = 0;
  try { sizeBytes = (await stat(file)).size; } catch { errors.push("Final video file is missing."); }
  if (errors.length) return { ok: false, errors, warnings, duration: 0, width: null, height: null, sizeBytes };
  const info = await probe(file);
  if (!info.hasVideo) errors.push("No video stream.");
  if (info.width !== OUTPUT.width || info.height !== OUTPUT.height) errors.push(`Resolution is ${info.width}×${info.height}, expected 1080×1920.`);
  if (info.videoCodec !== "h264") errors.push(`Video codec is ${info.videoCodec}, expected h264.`);
  if (!info.hasAudio) errors.push("No audio stream.");
  else if (info.audioCodec !== "aac") warnings.push(`Audio codec is ${info.audioCodec}.`);
  if (info.duration < 3) errors.push("Video is shorter than 3 seconds.");
  if (info.duration > 180) errors.push("Video is longer than YouTube's 3-minute Shorts limit.");
  else if (info.duration > opts.maxDuration + 1) warnings.push(`Duration ${info.duration.toFixed(1)}s is above the ${opts.maxDuration}s target.`);
  if (!opts.expectAudio) warnings.push("No narration: the video has music/SFX only.");
  if (sizeBytes > 250_000_000) warnings.push("File is larger than 250 MB.");
  return { ok: errors.length === 0, errors, warnings, duration: info.duration, width: info.width, height: info.height, sizeBytes };
}
