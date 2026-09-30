import fixWebmDuration from "fix-webm-duration";
import { drawTimelineFrame, loadProjectImages, loadProjectVideos, type VoiceEnvelope } from "@/lib/animation";
import { getEditorSettings, getTimeline, getTotalDuration } from "@/lib/timeline";
import type { MusicPreset, StudioProject } from "@/lib/types";

export { drawFrame, drawTimelineFrame, loadSceneImage, loadProjectImages, loadSceneVideo, loadProjectVideos } from "@/lib/animation";

export type PreparedMedia = {
  images: (HTMLImageElement | null)[];
  videos: (HTMLVideoElement | null)[];
  voices: (AudioBuffer | null)[];
  envelopes: (VoiceEnvelope | null)[];
};

function makeEnvelope(buffer: AudioBuffer): VoiceEnvelope {
  const levels = new Float32Array(Math.ceil(buffer.duration * 30) + 1);
  let peak = 0;
  for (let i = 0; i < levels.length; i++) {
    const from = Math.floor(i / 30 * buffer.sampleRate);
    const until = Math.min(buffer.length, from + Math.ceil(buffer.sampleRate / 30));
    if (from >= until) continue;
    let squares = 0; let samples = 0;
    const channels = Math.min(buffer.numberOfChannels, 2);
    for (let channel = 0; channel < channels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let j = from; j < until; j += 24) { squares += data[j] * data[j]; samples++; }
    }
    levels[i] = Math.sqrt(squares / Math.max(1, samples));
    peak = Math.max(peak, levels[i]);
  }
  if (peak > 0) for (let i = 0; i < levels.length; i++) levels[i] = Math.max(0, Math.min(1, (levels[i] / peak - .07) * 1.55));
  return { levels, duration: buffer.duration };
}

export async function prepareProjectMedia(project: StudioProject): Promise<PreparedMedia> {
  const imagesPromise = loadProjectImages(project.scenes);
  const videosPromise = loadProjectVideos(project.scenes);
  const voices: (AudioBuffer | null)[] = Array(project.scenes.length).fill(null);
  const envelopes: (VoiceEnvelope | null)[] = Array(project.scenes.length).fill(null);
  if (project.scenes.some((scene) => scene.audioData)) {
    const context = new AudioContext();
    try {
      await Promise.all(project.scenes.map(async (scene, index) => {
        if (!scene.audioData) return;
        try {
          const bytes = await (await fetch(scene.audioData)).arrayBuffer();
          const buffer = await context.decodeAudioData(bytes);
          voices[index] = buffer;
          envelopes[index] = makeEnvelope(buffer);
        } catch { /* Skip a broken voice file; the rest of the video still renders. */ }
      }));
    } finally { await context.close(); }
  }
  const [images, videos] = await Promise.all([imagesPromise, videosPromise]);
  return { images, videos, voices, envelopes };
}

const TUNES: Record<Exclude<MusicPreset, "off">, { notes: number[]; bass: number[]; step: number; shape: OscillatorType }> = {
  playful: { notes: [392, 440, 523.25, 440, 349.23, 392, 440, 329.63, 392, 523.25, 587.33, 523.25, 440, 392, 349.23, 392], bass: [196, 174.61, 164.81, 174.61], step: .55, shape: "sine" },
  dreamy: { notes: [392, 523.25, 587.33, 523.25, 349.23, 440, 523.25, 440, 329.63, 392, 440, 392], bass: [196, 174.61, 164.81, 174.61], step: .76, shape: "sine" },
  adventure: { notes: [392, 523.25, 587.33, 659.25, 587.33, 523.25, 440, 523.25, 392, 440, 523.25, 392], bass: [196, 261.63, 220, 196], step: .38, shape: "triangle" },
};

function scheduleMusic(context: AudioContext, output: AudioNode, project: StudioProject, startAt: number, offset: number) {
  const settings = getEditorSettings(project);
  if (settings.music === "off" || settings.musicVolume <= 0) return;
  const tune = TUNES[settings.music];
  const total = getTotalDuration(project);
  const volume = (settings.musicVolume / 100) * .075;
  for (let i = Math.max(0, Math.floor(offset / tune.step)); i * tune.step < total; i++) {
    const t = i * tune.step;
    if (t + tune.step < offset) continue;
    const when = startAt + Math.max(0, t - offset);
    const osc = context.createOscillator(); const gain = context.createGain();
    osc.type = tune.shape; osc.frequency.value = tune.notes[i % tune.notes.length];
    const noteDuration = Math.min(tune.step * .83, total - t);
    if (noteDuration <= 0) continue;
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume), when + Math.min(.05, noteDuration * .23));
    gain.gain.exponentialRampToValueAtTime(.0001, when + noteDuration);
    osc.connect(gain); gain.connect(output); osc.start(when); osc.stop(when + noteDuration + .01);
    if (i % 4 === 0) {
      const bass = context.createOscillator(); const bassGain = context.createGain();
      bass.type = "sine"; bass.frequency.value = tune.bass[Math.floor(i / 4) % tune.bass.length];
      const bassEnd = Math.min(total - t, tune.step * 3.5);
      bassGain.gain.setValueAtTime(.0001, when);
      bassGain.gain.exponentialRampToValueAtTime(Math.max(.001, volume * .42), when + .06);
      bassGain.gain.exponentialRampToValueAtTime(.0001, when + bassEnd);
      bass.connect(bassGain); bassGain.connect(output); bass.start(when); bass.stop(when + bassEnd + .01);
    }
  }
}

function scheduleVoices(context: AudioContext, output: AudioNode, project: StudioProject, voices: (AudioBuffer | null)[], startAt: number, offset: number) {
  const settings = getEditorSettings(project);
  if (settings.voiceVolume <= 0) return;
  getTimeline(project).forEach((clip) => {
    const buffer = voices[clip.index];
    if (!buffer || clip.end <= offset) return;
    const spokenAt = clip.start + .18;
    const rate = Math.min(1.35, Math.max(1, buffer.duration / Math.max(1.2, clip.duration - .5)));
    const position = Math.max(0, (offset - spokenAt) * rate);
    if (position >= buffer.duration) return;
    const when = startAt + Math.max(0, spokenAt - offset);
    const remaining = Math.min((buffer.duration - position) / rate, clip.end - Math.max(offset, spokenAt) - .06);
    if (remaining <= .05) return;
    const source = context.createBufferSource(); const gain = context.createGain();
    source.buffer = buffer; source.playbackRate.value = rate;
    const level = Math.max(.0001, settings.voiceVolume / 100);
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.linearRampToValueAtTime(level, when + Math.min(.08, remaining / 3));
    gain.gain.setValueAtTime(level, when + Math.max(.08, remaining - .12));
    gain.gain.linearRampToValueAtTime(.0001, when + remaining);
    source.connect(gain); gain.connect(output);
    source.start(when, position); source.stop(when + remaining + .01);
  });
}

export async function startPreviewAudio(project: StudioProject, voices: (AudioBuffer | null)[], offset: number) {
  const context = new AudioContext();
  await context.resume();
  const start = context.currentTime + .035;
  scheduleMusic(context, context.destination, project, start, offset);
  scheduleVoices(context, context.destination, project, voices, start, offset);
  return context;
}

export async function renderProjectVideo(project: StudioProject, onProgress: (progress: number) => void): Promise<Blob> {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream || typeof AudioContext === "undefined") {
    throw new Error("Video export needs a recent Chrome, Edge, or Firefox browser.");
  }
  if (!project.scenes.length) throw new Error("Add a scene before exporting.");
  const total = getTotalDuration(project);
  if (total > 60) throw new Error("Keep the finished Short under 60 seconds.");
  const canvas = document.createElement("canvas"); canvas.width = 540; canvas.height = 960;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a video canvas.");
  const media = await prepareProjectMedia(project);
  const audio = new AudioContext();
  await audio.resume();
  const destination = audio.createMediaStreamDestination();
  const startAudio = audio.currentTime + .15;
  scheduleMusic(audio, destination, project, startAudio, 0);
  scheduleVoices(audio, destination, project, media.voices, startAudio, 0);
  const stream = canvas.captureStream(24);
  for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
  const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((format) => MediaRecorder.isTypeSupported(format));
  if (!mimeType) { stream.getTracks().forEach((track) => track.stop()); await audio.close(); throw new Error("This browser cannot export WebM videos. Try Chrome or Edge."); }
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_800_000, audioBitsPerSecond: 96000 });
  const chunks: BlobPart[] = [];
  const result = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { stream.getTracks().forEach((track) => track.stop()); media.videos.forEach((video) => video?.pause()); void audio.close(); reject(new Error("Video recording stopped unexpectedly.")); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      media.videos.forEach((video) => video?.pause());
      await audio.close();
      if (!chunks.length) {
        reject(new Error("The video export was empty. Please try again."));
        return;
      }
      const rawBlob = new Blob(chunks, { type: "video/webm" });
      try {
        const fixedBlob = await fixWebmDuration(rawBlob, Math.round(total * 1000), { logger: false });
        resolve(new Blob([fixedBlob], { type: "video/webm" }));
      } catch {
        // The raw WebM is still valid; only its optional duration metadata could not be repaired.
        resolve(rawBlob);
      }
    };
  });
  drawTimelineFrame(context, project, 0, media.images, media.envelopes, media.videos);
  recorder.start(1000);
  const started = performance.now();
  let lastReported = -1;
  function frame() {
    const elapsed = Math.min(total, (performance.now() - started) / 1000);
    drawTimelineFrame(context!, project, elapsed, media.images, media.envelopes, media.videos);
    const tick = Math.floor(elapsed * 4);
    if (tick !== lastReported) { lastReported = tick; onProgress(Math.min(100, Math.round(elapsed / total * 100))); }
    if (elapsed < total) requestAnimationFrame(frame);
    else recorder.stop();
  }
  requestAnimationFrame(frame);
  return result;
}
