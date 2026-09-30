"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Captions, Check, CheckCircle2,
  ChevronRight, Clapperboard, Clock3, Copy, Download, ExternalLink, Film, ImagePlus,
  Info, LoaderCircle, Mic2, Music2, Pause, Play, Plus, Save, Sparkles, Square,
  Trash2, UploadCloud, Video, Volume2, VolumeX, WandSparkles, TvMinimalPlay,
} from "lucide-react";
import EditorTimeline from "@/components/EditorTimeline";
import { apiRequest, downloadVideo, jsonRequest } from "@/lib/client-api";
import { drawTimelineFrame, prepareProjectMedia, renderProjectVideo, startPreviewAudio, type PreparedMedia } from "@/lib/render";
import { getEditorSettings, getSceneDuration, getTimeline, getTotalDuration, MAX_SHORT_SECONDS, resolvePlayhead, sceneDefaults } from "@/lib/timeline";
import {
  CHARACTERS, POLLINATIONS_VOICES,
  type CameraMotion, type CaptionStyle, type Character, type CharacterMotion,
  type EditorSettings, type Expression, type MusicPreset, type Palette,
  type SceneTransition, type StoryScene, type StudioConfig, type StudioProject, type VoiceProvider,
} from "@/lib/types";

type Props = {
  project: StudioProject;
  config: StudioConfig;
  onBack: () => void;
  onSaved: (project: StudioProject) => void;
  onGoSettings: () => void;
  notify: (message: string, kind?: "success" | "error" | "info") => void;
  requireAccess: () => boolean;
};
type Busy = "saving" | "rendering" | "uploading" | "artwork" | "voice" | null;
type VoiceOption = { id: string; name: string; description: string };

const paletteColors: Record<Palette, string> = {
  meadow: "#b9d7b0", ocean: "#86cfd1", space: "#8880ae", forest: "#85b591",
  sunset: "#f5b5a2", night: "#686b94", candy: "#dfb9d9",
};
const motionChoices: { id: CharacterMotion; label: string; symbol: string }[] = [
  { id: "bounce", label: "Bounce", symbol: "↟" }, { id: "walk", label: "Walk", symbol: "➜" },
  { id: "dance", label: "Dance", symbol: "♫" }, { id: "float", label: "Float", symbol: "◌" },
  { id: "wave", label: "Wave", symbol: "✳" },
];
const cameraChoices: { id: CameraMotion; label: string }[] = [
  { id: "push-in", label: "Zoom in" }, { id: "pan-left", label: "Pan left" },
  { id: "pan-right", label: "Pan right" }, { id: "steady", label: "Still" },
];
const transitionChoices: { id: SceneTransition; label: string }[] = [
  { id: "fade", label: "Dissolve" }, { id: "slide", label: "Slide" },
  { id: "pop", label: "Pop in" }, { id: "cut", label: "Cut" },
];
const expressionChoices: { id: Expression; label: string; emoji: string }[] = [
  { id: "happy", label: "Happy", emoji: "😊" }, { id: "excited", label: "Excited", emoji: "🤩" },
  { id: "curious", label: "Curious", emoji: "🤔" }, { id: "sleepy", label: "Sleepy", emoji: "😴" },
  { id: "surprised", label: "Surprised", emoji: "😮" },
];
const musicChoices: { id: MusicPreset; label: string; subtitle: string }[] = [
  { id: "playful", label: "Playful", subtitle: "Bright & bouncy" },
  { id: "dreamy", label: "Dreamy", subtitle: "Soft & gentle" },
  { id: "adventure", label: "Adventure", subtitle: "Upbeat & bold" },
  { id: "off", label: "No music", subtitle: "Voice only" },
];
const propOptions = ["butterfly", "star", "flower", "balloon", "book", "rocket", "shell", "none"];
const EMPTY_MEDIA: PreparedMedia = { images: [], videos: [], voices: [], envelopes: [] };

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read that file."));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export default function Editor({ project, config, onBack, onSaved, onGoSettings, notify, requireAccess }: Props) {
  const [draft, setDraft] = useState<StudioProject>(project);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"motion" | "voice" | "text" | "publish">("motion");
  const [dirty, setDirty] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState(0);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [voicesError, setVoicesError] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  const selectedRef = useRef(0);
  const playheadRef = useRef(0);
  const mediaRef = useRef<PreparedMedia>(EMPTY_MEDIA);
  const playingRef = useRef(false);
  const mutedRef = useRef(false);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastNarratedRef = useRef(-1);
  const lastUiTickRef = useRef(0);
  const historyRef = useRef<StudioProject[]>([]);
  const futureRef = useRef<StudioProject[]>([]);
  const recorderRef = useRef<{ recorder: MediaRecorder; stream: MediaStream } | null>(null);
  draftRef.current = draft;
  selectedRef.current = selectedIndex;
  mutedRef.current = muted;
  const settings = getEditorSettings(draft);
  const selected = draft.scenes[Math.min(selectedIndex, draft.scenes.length - 1)];
  const total = getTotalDuration(draft);
  const timeline = getTimeline(draft);
  const selectedDuration = selected ? getSceneDuration(draft, selected) : 0;
  const scenesWithVoice = draft.scenes.filter((scene) => !!scene.audioData).length;

  const mediaSignature = draft.scenes.map((scene) => `${scene.id}:${scene.artUrl?.length || 0}:${scene.artUrl?.slice(-18) || ""}:${scene.videoUrl?.length || 0}:${scene.videoUrl?.slice(-24) || ""}:${scene.audioData?.length || 0}:${scene.audioData?.slice(-18) || ""}`).join("|");
  useEffect(() => {
    let cancelled = false;
    const snapshot = draftRef.current;
    void prepareProjectMedia(snapshot).then((media) => {
      if (!cancelled) { mediaRef.current = media; setMediaVersion((version) => version + 1); }
    }).catch(() => { if (!cancelled) mediaRef.current = EMPTY_MEDIA; });
    return () => { cancelled = true; };
  }, [mediaSignature]);

  useEffect(() => {
    if (playingRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext("2d");
    if (context && draft.scenes.length) drawTimelineFrame(context, draft, Math.min(playheadRef.current, Math.max(.001, total - .001)), mediaRef.current.images, mediaRef.current.envelopes, mediaRef.current.videos);
  }, [draft, total, mediaVersion]);

  useEffect(() => {
    if (activeTab !== "voice" || !config.elevenLabsConfigured) return;
    let live = true;
    void apiRequest<{ voices: VoiceOption[]; error?: string }>("/api/voices").then((data) => {
      if (live) { setVoiceOptions(data.voices); setVoicesError(data.error || ""); }
    }).catch((error) => { if (live) setVoicesError(error instanceof Error ? error.message : "Could not load voices."); });
    return () => { live = false; };
  }, [activeTab, config.elevenLabsConfigured]);

  useEffect(() => () => {
    playingRef.current = false;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => {});
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  function paintAt(seconds: number, updateUi = true) {
    const projectNow = draftRef.current;
    const limit = getTotalDuration(projectNow);
    const time = Math.max(0, Math.min(seconds, Math.max(.001, limit - .001)));
    playheadRef.current = time;
    const context = canvasRef.current?.getContext("2d");
    if (context) {
      const position = drawTimelineFrame(context, projectNow, time, mediaRef.current.images, mediaRef.current.envelopes, mediaRef.current.videos);
      if (position && position.index !== selectedRef.current) { selectedRef.current = position.index; setSelectedIndex(position.index); }
    }
    if (updateUi) setPlayhead(time);
  }

  function stopPlayback() {
    playingRef.current = false; setPlaying(false);
    if (animationRef.current !== null) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    if (audioContextRef.current) { void audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    mediaRef.current.videos.forEach((video) => video?.pause());
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    lastNarratedRef.current = -1;
  }

  function speakBrowserFallback(index: number) {
    const scene = draftRef.current.scenes[index];
    if (!scene || mediaRef.current.voices[index] || !scene.narration || mutedRef.current || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(scene.narration);
    utterance.rate = 1.04; utterance.pitch = 1.12; utterance.volume = .75;
    window.speechSynthesis.speak(utterance);
  }

  function startPlayback(from: number) {
    stopPlayback();
    const current = draftRef.current;
    const duration = getTotalDuration(current);
    const offset = from >= duration - .06 ? 0 : from;
    paintAt(offset);
    playingRef.current = true; setPlaying(true);
    lastNarratedRef.current = -1;
    const mixProject = mutedRef.current ? { ...current, editSettings: { ...getEditorSettings(current), musicVolume: 0, voiceVolume: 0 } } : current;
    void startPreviewAudio(mixProject, mediaRef.current.voices, offset).then((context) => {
      if (!playingRef.current) void context.close().catch(() => {});
      else audioContextRef.current = context;
    }).catch(() => {});
    const started = performance.now();
    function tick() {
      if (!playingRef.current) return;
      const elapsed = Math.min(duration, offset + (performance.now() - started) / 1000);
      const position = resolvePlayhead(draftRef.current, elapsed);
      if (position.index !== lastNarratedRef.current) { lastNarratedRef.current = position.index; speakBrowserFallback(position.index); }
      const redrawUi = performance.now() - lastUiTickRef.current > 90 || elapsed >= duration;
      paintAt(elapsed, redrawUi);
      if (redrawUi) lastUiTickRef.current = performance.now();
      if (elapsed >= duration) stopPlayback();
      else animationRef.current = requestAnimationFrame(tick);
    }
    animationRef.current = requestAnimationFrame(tick);
  }

  function seek(seconds: number) {
    const wasPlaying = playingRef.current;
    stopPlayback(); paintAt(seconds);
    if (wasPlaying) startPlayback(seconds);
  }

  function selectScene(index: number) {
    const clip = getTimeline(draftRef.current)[index];
    if (clip) { seek(clip.start + Math.min(.08, clip.duration / 4)); selectedRef.current = index; setSelectedIndex(index); }
  }

  function commit(next: StudioProject) {
    historyRef.current = [...historyRef.current.slice(-24), draftRef.current];
    futureRef.current = [];
    draftRef.current = next; setDraft(next); setDirty(true); setVideoBlob(null);
    setHistoryVersion((v) => v + 1);
  }

  function undo() {
    if (!historyRef.current.length) return;
    stopPlayback();
    const previous = historyRef.current.pop()!;
    futureRef.current.push(draftRef.current);
    draftRef.current = previous; setDraft(previous); setDirty(true); setVideoBlob(null);
    paintAt(Math.min(playheadRef.current, Math.max(.001, getTotalDuration(previous) - .001)));
    setHistoryVersion((v) => v + 1);
  }

  function redo() {
    if (!futureRef.current.length) return;
    stopPlayback();
    const next = futureRef.current.pop()!;
    historyRef.current.push(draftRef.current);
    draftRef.current = next; setDraft(next); setDirty(true); setVideoBlob(null);
    paintAt(Math.min(playheadRef.current, Math.max(.001, getTotalDuration(next) - .001)));
    setHistoryVersion((v) => v + 1);
  }

  function changeProject(patch: Partial<StudioProject>) { commit({ ...draftRef.current, ...patch }); }
  function changeScene(patch: Partial<StoryScene>, id = selected?.id) {
    if (!id) return;
    commit({ ...draftRef.current, scenes: draftRef.current.scenes.map((scene) => scene.id === id ? { ...scene, ...patch } : scene) });
  }
  function changeSettings(patch: Partial<EditorSettings>) {
    const current = draftRef.current;
    const previous = getEditorSettings(current);
    const changingVoice = patch.voiceProvider !== undefined && patch.voiceProvider !== previous.voiceProvider || patch.voiceId !== undefined && patch.voiceId !== previous.voiceId;
    const scenes = changingVoice ? current.scenes.map((scene) => scene.audioSource === "generated" ? { ...scene, audioData: undefined, audioSource: undefined } : scene) : current.scenes;
    commit({ ...current, scenes, editSettings: { ...previous, ...patch } });
    if (changingVoice && current.scenes.some((scene) => scene.audioSource === "generated")) notify("Voice changed. Regenerate AI clips to match the new character voice.", "info");
  }

  function setSceneDuration(value: number) {
    if (!selected || !Number.isFinite(value)) return;
    const seconds = Math.max(2, Math.min(20, Math.round(value * 2) / 2));
    const current = draftRef.current;
    const scenes = current.scenes.map((scene) => ({ ...scene, duration: getSceneDuration(current, scene) }));
    scenes[selectedIndex].duration = seconds;
    const sum = scenes.reduce((acc, scene) => acc + (scene.duration || 0), 0);
    if (sum > MAX_SHORT_SECONDS) { notify("This would make the Short longer than 60 seconds.", "info"); return; }
    stopPlayback(); commit({ ...current, duration: Math.round(sum), scenes });
  }

  function addScene() {
    const current = draftRef.current;
    if (current.scenes.length >= 8) { notify("A Short can have up to 8 scenes.", "info"); return; }
    if (getTotalDuration(current) + 4 > MAX_SHORT_SECONDS) { notify("Shorten a scene first to stay under 60 seconds.", "info"); return; }
    const index = current.scenes.length;
    const next: StoryScene = {
      id: crypto.randomUUID(), heading: "A new little moment", caption: "Something wonderful happens next!",
      narration: "And then, a wonderful new moment began.", visualPrompt: "A colorful original children's cartoon setting",
      palette: selected?.palette || "meadow", character: selected?.character || current.character, prop: "star",
      duration: 4, ...sceneDefaults(index),
    };
    stopPlayback(); commit({ ...current, duration: Math.round(getTotalDuration(current) + 4), scenes: [...current.scenes, next] });
    selectedRef.current = index; setSelectedIndex(index); paintAt(getTotalDuration(current) + .01);
  }

  function duplicateScene() {
    const current = draftRef.current; if (!selected) return;
    if (current.scenes.length >= 8) { notify("A Short can have up to 8 scenes.", "info"); return; }
    if (getTotalDuration(current) + selectedDuration > MAX_SHORT_SECONDS) { notify("Shorten scenes first to stay under 60 seconds.", "info"); return; }
    const copy: StoryScene = { ...selected, id: crypto.randomUUID(), heading: `${selected.heading} (copy)`, audioData: undefined, audioSource: undefined };
    const scenes = [...current.scenes]; scenes.splice(selectedIndex + 1, 0, copy);
    stopPlayback(); commit({ ...current, scenes, duration: Math.round(getTotalDuration(current) + selectedDuration) });
    selectedRef.current = selectedIndex + 1; setSelectedIndex(selectedIndex + 1);
    paintAt(timeline[selectedIndex]?.end + .01 || 0);
    notify("Scene duplicated. Edit it to add a new moment.", "success");
  }

  function removeScene() {
    const current = draftRef.current;
    if (current.scenes.length <= 1) { notify("Keep at least one scene in the story.", "info"); return; }
    const scenes = current.scenes.filter((_, index) => index !== selectedIndex);
    const duration = getTotalDuration(current) - selectedDuration;
    const index = Math.min(selectedIndex, scenes.length - 1);
    stopPlayback(); commit({ ...current, scenes, duration: Math.round(duration) });
    selectedRef.current = index; setSelectedIndex(index);
    const start = scenes.slice(0, index).reduce((sum, scene) => sum + getSceneDuration(current, scene), 0);
    paintAt(start + .01);
  }

  function moveScene(from: number, to: number) {
    const current = draftRef.current;
    if (from === to || from < 0 || to < 0 || from >= current.scenes.length || to >= current.scenes.length) return;
    const selectedId = current.scenes[selectedRef.current]?.id;
    const scenes = [...current.scenes]; const [moved] = scenes.splice(from, 1); scenes.splice(to, 0, moved);
    const index = scenes.findIndex((scene) => scene.id === selectedId);
    stopPlayback(); commit({ ...current, scenes });
    selectedRef.current = index; setSelectedIndex(index);
    const start = scenes.slice(0, index).reduce((sum, scene) => sum + getSceneDuration(current, scene), 0);
    paintAt(start + .01);
  }

  async function persist(candidate: StudioProject) {
    if (!requireAccess()) return null;
    const data = await apiRequest<{ project: StudioProject }>(`/api/projects/${candidate.id}`, jsonRequest(candidate, "PUT"));
    draftRef.current = data.project; setDraft(data.project); setDirty(false); onSaved(data.project);
    return data.project;
  }

  async function handleSave() {
    if (!requireAccess()) return;
    setBusy("saving");
    try { await persist(draftRef.current); notify("All creative edits saved.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not save.", "error"); }
    finally { setBusy(null); }
  }

  async function handleMarkReady() {
    if (!requireAccess()) return;
    setBusy("saving");
    try { await persist({ ...draftRef.current, status: "ready" }); notify("Your story is ready to share!", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not update status.", "error"); }
    finally { setBusy(null); }
  }

  async function handleArt() {
    if (!requireAccess()) return;
    if (!config.pollinationsConfigured) { notify("Add a Pollinations key in Settings to generate backgrounds, or upload your own image for free.", "info"); return; }
    setBusy("artwork"); stopPlayback();
    try {
      const sceneId = selected.id;
      const saved = dirty ? await persist(draftRef.current) : draftRef.current;
      if (!saved) return;
      const data = await apiRequest<{ project: StudioProject }>("/api/art", jsonRequest({ projectId: saved.id, sceneId }));
      draftRef.current = data.project; setDraft(data.project); onSaved(data.project); setVideoBlob(null);
      notify("Animated character layered over your new background!", "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not make artwork.", "error"); }
    finally { setBusy(null); }
  }

  async function importArt(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5_500_000) { notify("Choose a PNG, JPEG, or WebP image under 5.5 MB.", "error"); return; }
    try { changeScene({ artUrl: await fileToDataUrl(file) }); notify("Background added. Your character stays animated on top.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Image upload failed.", "error"); }
    if (artInputRef.current) artInputRef.current.value = "";
  }

  async function attachVoice(file: Blob, source: "uploaded" | "recorded", targetId = selected?.id) {
    if (!targetId) return;
    if (file.size > 3_900_000) { notify("Keep each voice clip under 3.9 MB.", "error"); return; }
    try {
      const data = await fileToDataUrl(file);
      changeScene({ audioData: data, audioSource: source }, targetId);
      notify(source === "recorded" ? "Your character voice recording is attached!" : "Voice clip attached to this scene.", "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not attach voice.", "error"); }
    if (audioInputRef.current) audioInputRef.current.value = "";
  }

  async function toggleRecording() {
    if (recorderRef.current) { recorderRef.current.recorder.stop(); setRecording(false); return; }
    if (!requireAccess()) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { notify("Voice recording needs microphone access in a secure browser.", "error"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const format = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = format ? new MediaRecorder(stream, { mimeType: format }) : new MediaRecorder(stream);
      const chunks: Blob[] = []; const sceneId = selected.id;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop()); recorderRef.current = null; setRecording(false);
        if (chunks.length) void attachVoice(new Blob(chunks, { type: recorder.mimeType.split(";")[0] || "audio/webm" }), "recorded", sceneId);
      };
      recorder.start(); recorderRef.current = { recorder, stream }; setRecording(true);
      notify("Recording your character voice. Tap stop when you're done.", "info");
    } catch { notify("Microphone access was blocked. You can upload an audio clip instead.", "error"); }
  }

  async function generateVoice(all: boolean) {
    if (!requireAccess()) return;
    const currentSettings = getEditorSettings(draftRef.current);
    if (currentSettings.voiceProvider === "pollinations" && !config.pollinationsConfigured) { notify("Add a Pollinations key in Settings, or record/upload a voice for free.", "info"); return; }
    if (currentSettings.voiceProvider === "elevenlabs" && !config.elevenLabsConfigured) { notify("Add an ElevenLabs key in Settings, or record/upload a voice for free.", "info"); return; }
    if (currentSettings.voiceProvider === "elevenlabs" && !voiceOptions.some((voice) => voice.id === currentSettings.voiceId)) { notify("Choose a voice from the available ElevenLabs voices first.", "info"); return; }
    setBusy("voice"); setVoiceProgress(0); stopPlayback();
    try {
      let current: StudioProject = draftRef.current;
      if (dirty) { const saved = await persist(current); if (!saved) return; current = saved; }
      const ids = all ? current.scenes.filter((scene) => !scene.audioData || scene.audioSource === "generated").map((scene) => scene.id) : [selected.id];
      if (!ids.length) { notify("All scenes already have recorded or imported voices.", "info"); return; }
      for (let i = 0; i < ids.length; i++) {
        const data = await apiRequest<{ project: StudioProject }>("/api/voice", jsonRequest({ projectId: current.id, sceneId: ids[i] }));
        current = data.project; draftRef.current = current; setDraft(current); onSaved(current); setVoiceProgress(i + 1);
      }
      setVideoBlob(null);
      notify(`Real voice audio saved for ${ids.length} ${ids.length === 1 ? "scene" : "scenes"}.`, "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not make the voice track.", "error"); }
    finally { setBusy(null); }
  }

  async function handleExport() {
    if (!requireAccess()) return;
    try {
      let current: StudioProject = draftRef.current;
      if (dirty) { setBusy("saving"); const saved = await persist(current); if (!saved) return; current = saved; }
      stopPlayback(); setBusy("rendering"); setProgress(0);
      const blob = await renderProjectVideo(current, setProgress);
      setVideoBlob(blob); downloadVideo(blob, current.title);
      notify(current.scenes.some((scene) => !scene.audioData) ? "Animated video downloaded. Scenes without saved voices use music only in the export." : "Your fully voiced animated cartoon is downloaded!", "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Video export failed.", "error"); }
    finally { setBusy(null); }
  }

  async function handlePublish() {
    if (!requireAccess()) return;
    if (!config.youtubeConnected) { notify("Connect your YouTube channel in Settings first.", "info"); setActiveTab("publish"); return; }
    if (!reviewed) { notify("Please review the kids-content checkbox before uploading.", "info"); return; }
    try {
      let current: StudioProject = draftRef.current;
      if (dirty) { setBusy("saving"); const saved = await persist(current); if (!saved) return; current = saved; }
      let blob = videoBlob;
      if (!blob) { stopPlayback(); setBusy("rendering"); setProgress(0); blob = await renderProjectVideo(current, setProgress); setVideoBlob(blob); }
      setBusy("uploading");
      const form = new FormData(); form.set("projectId", current.id); form.set("video", new File([blob], "littleloop-short.webm", { type: "video/webm" }));
      const data = await apiRequest<{ project: StudioProject; url: string }>("/api/youtube/upload", { method: "POST", body: form });
      draftRef.current = data.project; setDraft(data.project); onSaved(data.project);
      notify("Your animated Short was uploaded to YouTube!", "success"); setActiveTab("publish");
    } catch (error) { notify(error instanceof Error ? error.message : "YouTube upload failed.", "error"); }
    finally { setBusy(null); }
  }

  return (
    <div className="editor-page editor-v2">
      <div className="editor-heading-row">
        <div className="editor-heading-left">
          <button className="icon-back" onClick={() => { if (!dirty || window.confirm("Leave without saving your latest edits?")) { stopPlayback(); onBack(); } }} aria-label="Back to projects"><ArrowLeft size={19} /></button>
          <div><div className="editor-breadcrumb">My projects <ChevronRight size={13} /> Animation studio <span className="editor-v2-badge"><Sparkles size={11} /> MOTION EDITOR</span></div><div className="editor-title-line"><h1>{draft.title}</h1><span className={`status-chip status-${draft.status}`}>{draft.status === "published" ? "Published" : draft.status === "ready" ? "Ready to share" : "Draft"}</span>{dirty && <span className="unsaved-label">Unsaved changes</span>}</div></div>
        </div>
        <div className="editor-top-actions"><button className="button button-light" onClick={handleSave} disabled={!!busy}><Save size={16} /> Save</button><button className="button button-outline" onClick={handleExport} disabled={!!busy}><Download size={16} /> Export video</button><button className="button button-primary" onClick={() => setActiveTab("publish")} disabled={!!busy}><TvMinimalPlay size={17} /> Publish <ArrowRight size={15} /></button></div>
      </div>
      <div className="editor-feature-strip"><span><Film size={16} /> Moving characters</span><span><Mic2 size={16} /> Real voice tracks</span><span><WandSparkles size={16} /> Camera & transitions</span><strong>{Math.round(total * 10) / 10}s · 9:16 Short</strong></div>
      <div className="editor-grid">
        <aside className="editor-scenes panel">
          <div className="panel-title-line"><div><p className="tiny-eyebrow">YOUR STORY</p><h2>Storyboard</h2></div><span className="count-pill">{draft.scenes.length} clips</span></div>
          <p className="panel-helper">Choose a scene, then bring it to life.</p>
          <div className="scene-list">{draft.scenes.map((scene, index) => <button key={scene.id} className={`scene-item ${selectedIndex === index ? "selected" : ""}`} onClick={() => selectScene(index)}>
            <div className={`scene-mini palette-${scene.palette}`} style={scene.artUrl ? { backgroundImage: `url(${scene.artUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{!scene.artUrl && <span>{CHARACTERS.find((item) => item.value === scene.character)?.emoji || "✨"}</span>}<small>{String(index + 1).padStart(2, "0")}</small></div>
            <div className="scene-item-copy"><strong>{scene.heading || `Scene ${index + 1}`}</strong><span>{scene.caption || "Add a caption"}</span><em>{Math.round(getSceneDuration(draft, scene) * 10) / 10}s · {scene.motion || sceneDefaults(index).motion} {scene.audioData ? "· voiced" : ""}</em></div>{selectedIndex === index && <span className="scene-selected-dot" />}
          </button>)}</div>
          <button className="add-scene-button" onClick={addScene} disabled={!!busy}><Plus size={17} /> Add a scene</button>
          <div className="scene-panel-footer"><span className="footer-sparkle">✦</span><p>Tip: make each moment feel different with gestures and expressions.</p></div>
        </aside>

        <section className="preview-panel">
          <div className="preview-topline"><span className="live-dot" /> ANIMATED PREVIEW <span className="preview-format">540 × 960 · 9:16</span></div>
          <div className="preview-stage"><div className="preview-aura preview-aura-one" /><div className="preview-aura preview-aura-two" /><div className="phone-frame"><canvas ref={canvasRef} width={540} height={960} aria-label={`Animated preview: ${selected?.caption || "cartoon"}`} /></div><span className="preview-live-pill"><span /> MOTION ON</span></div>
          <div className="preview-controls"><button className="round-play" aria-label={playing ? "Pause preview" : "Play preview"} onClick={() => playingRef.current ? stopPlayback() : startPlayback(playheadRef.current)}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" className="play-offset" />}</button><div className="preview-timeline"><div className="preview-timeline-label"><span>{Math.floor(playhead / 60)}:{String(Math.floor(playhead % 60)).padStart(2, "0")} / {Math.floor(total / 60)}:{String(Math.ceil(total % 60)).padStart(2, "0")}</span><span>Scene {selectedIndex + 1} of {draft.scenes.length}</span></div><div className="preview-track"><span style={{ width: `${playhead / Math.max(1, total) * 100}%` }} /></div></div><button className="volume-button" onClick={() => { const next = !muted; setMuted(next); mutedRef.current = next; if (playingRef.current) startPlayback(playheadRef.current); }} aria-label={muted ? "Unmute preview" : "Mute preview"}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button></div>
          {busy && <div className="render-progress"><div className="render-progress-top"><LoaderCircle size={16} className="spin" /><strong>{busy === "rendering" ? `Rendering your animated cartoon… ${progress}%` : busy === "uploading" ? "Uploading to YouTube…" : busy === "voice" ? `Making character voices… ${voiceProgress}/${draft.scenes.length}` : busy === "artwork" ? "Painting a background…" : "Saving your edit…"}</strong></div>{busy === "rendering" && <div className="progress-rail"><span style={{ width: `${progress}%` }} /></div>}</div>}
          <div className="preview-footnote"><AudioLines size={16} /><span>{scenesWithVoice}/{draft.scenes.length} scenes have exportable voice audio. Browser speech previews are not recorded in exports.</span></div>
        </section>

        <aside className="inspector panel" id="publish-panel">
          <div className="inspector-tabs editor-four-tabs"><button className={activeTab === "motion" ? "active" : ""} onClick={() => setActiveTab("motion")}><Clapperboard size={14} /> Motion</button><button className={activeTab === "voice" ? "active" : ""} onClick={() => setActiveTab("voice")}><Mic2 size={14} /> Voice</button><button className={activeTab === "text" ? "active" : ""} onClick={() => setActiveTab("text")}><Captions size={14} /> Text</button><button className={activeTab === "publish" ? "active" : ""} onClick={() => setActiveTab("publish")}><TvMinimalPlay size={14} /> Share</button></div>
          {activeTab === "motion" && <div className="inspector-body motion-body"><div className="inspector-intro"><span className="inspector-icon"><Clapperboard size={18} /></span><div><h2>Bring it to life</h2><p>Scene {selectedIndex + 1} · Every frame moves.</p></div></div>
            <div className="editor-field-title">Character action <span>KEYFRAMED</span></div><div className="motion-picker">{motionChoices.map((item) => <button key={item.id} className={(selected.motion || sceneDefaults(selectedIndex).motion) === item.id ? "active" : ""} onClick={() => changeScene({ motion: item.id })}><span>{item.symbol}</span>{item.label}</button>)}</div>
            <div className="editor-field-title field-top-gap">Feeling today</div><div className="expression-picker">{expressionChoices.map((item) => <button key={item.id} className={(selected.expression || sceneDefaults(selectedIndex).expression) === item.id ? "active" : ""} onClick={() => changeScene({ expression: item.id })}><span>{item.emoji}</span>{item.label}</button>)}</div>
            <div className="editor-field-title field-top-gap">Camera move</div><div className="option-chips">{cameraChoices.map((item) => <button key={item.id} className={(selected.camera || sceneDefaults(selectedIndex).camera) === item.id ? "active" : ""} onClick={() => changeScene({ camera: item.id })}>{item.label}</button>)}</div>
            <div className="editor-field-title field-top-gap">Scene entrance</div><div className="option-chips">{transitionChoices.map((item) => <button key={item.id} className={(selected.transition || sceneDefaults(selectedIndex).transition) === item.id ? "active" : ""} onClick={() => changeScene({ transition: item.id })}>{item.label}</button>)}</div>
            <div className="inspector-divider" />
            <div className="duration-control"><div><strong>Scene length</strong><small>Adjust the rhythm of your story</small></div><span>{Math.round(selectedDuration * 10) / 10}s</span></div><input className="studio-range" aria-label="Scene length in seconds" type="range" min="2" max="20" step="0.5" value={selectedDuration} onChange={(event) => setSceneDuration(Number(event.target.value))} /><div className="range-ends"><span>2s</span><span>20s</span></div>
            <div className="editor-field-title field-top-gap">Scene world</div><div className="palette-options">{(Object.keys(paletteColors) as Palette[]).map((palette) => <button key={palette} title={palette} aria-label={`${palette} color palette`} className={selected.palette === palette ? "active" : ""} onClick={() => changeScene({ palette })} style={{ background: paletteColors[palette] }}>{selected.palette === palette && <Check size={14} />}</button>)}</div>
            <div className="editor-mini-grid"><label className="field-label">Character<select className="field-input field-select" value={selected.character} onChange={(event) => changeScene({ character: event.target.value as Character })}>{CHARACTERS.map((item) => <option key={item.value} value={item.value}>{item.emoji} {item.label}</option>)}</select></label><label className="field-label">Magic prop<select className="field-input field-select" value={selected.prop} onChange={(event) => changeScene({ prop: event.target.value as StoryScene["prop"] })}>{propOptions.map((prop) => <option key={prop} value={prop}>{prop === "none" ? "None" : prop.charAt(0).toUpperCase() + prop.slice(1)}</option>)}</select></label></div>
            <div className="inspector-divider" />
            {selected.videoUrl && <div className="footage-credit"><Video size={16} /><div><strong>Imported video clip</strong><span>{selected.sourceCredit || selected.sourceName || "Stock/AI footage"}</span>{selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">View source <ExternalLink size={12} /></a>}</div></div>}
            <div className="tool-heading"><ImagePlus size={16} /><strong>{selected.videoUrl ? "Footage & poster" : "Animated background"}</strong><span>optional</span></div><p className="editor-inspector-note">{selected.videoUrl ? "Video footage fills the frame; captions, voice and music are added by Littleloop." : "Photos pan and zoom behind your moving character."}</p><input type="file" ref={artInputRef} accept="image/png,image/jpeg,image/webp" className="visually-hidden-input" onChange={(event) => void importArt(event.target.files?.[0])} /><div className="editor-tool-buttons"><button className="tool-action" onClick={() => artInputRef.current?.click()}><UploadCloud size={17} /><span><strong>Upload a background</strong><small>Your own art or photo</small></span></button><button className="tool-action" onClick={handleArt} disabled={!!busy}><WandSparkles size={17} /><span><strong>Generate backdrop</strong><small>{config.pollinationsConfigured ? "Uses provider credits" : "Needs Pollinations key"}</small></span></button></div>
            {selected.artUrl && <button className="text-action" onClick={() => changeScene({ artUrl: undefined })}>Remove background image</button>}
            <label className="editor-checkbox-row"><input type="checkbox" checked={selected.showCharacter !== false} onChange={(event) => changeScene({ showCharacter: event.target.checked })} /> Show moving character over background</label>
            <div className="inspector-divider" /><div className="editor-scene-tools"><button onClick={() => moveScene(selectedIndex, selectedIndex - 1)} disabled={selectedIndex === 0}><ArrowUp size={15} /> Move up</button><button onClick={() => moveScene(selectedIndex, selectedIndex + 1)} disabled={selectedIndex === draft.scenes.length - 1}><ArrowDown size={15} /> Move down</button><button onClick={duplicateScene}><Copy size={15} /> Duplicate</button><button className="danger" onClick={removeScene}><Trash2 size={15} /> Delete</button></div>
          </div>}

          {activeTab === "voice" && <div className="inspector-body voice-body"><div className="inspector-intro"><span className="inspector-icon voice-icon"><AudioLines size={19} /></span><div><h2>Give them a voice</h2><p>Real audio makes stories feel alive.</p></div></div>
            <div className="voice-status-card"><span className={selected.audioData ? "voice-status-icon ready" : "voice-status-icon"}>{selected.audioData ? <Check size={19} /> : <Mic2 size={19} />}</span><div><strong>{selected.audioData ? "Voice clip is ready" : "This scene needs a voice"}</strong><small>{selected.audioData ? `${selected.audioSource === "recorded" ? "Your recording" : selected.audioSource === "uploaded" ? "Imported audio" : "AI-generated voice"} · included in export` : "Record, import or generate a character voice"}</small></div></div>
            {selected.audioData && <div className="voice-clip-player"><audio controls preload="metadata" src={selected.audioData} aria-label="Play this scene's voice recording" /><button className="text-action" onClick={() => changeScene({ audioData: undefined, audioSource: undefined })}>Remove</button></div>}
            {mediaRef.current.voices[selectedIndex] && mediaRef.current.voices[selectedIndex]!.duration > selectedDuration - .35 && <div className="voice-fit-warning"><Info size={15} /><span>Voice is {mediaRef.current.voices[selectedIndex]!.duration.toFixed(1)}s but scene is {selectedDuration.toFixed(1)}s. Lengthen the scene or shorten the script.</span><button onClick={() => setSceneDuration(Math.min(20, Math.ceil(mediaRef.current.voices[selectedIndex]!.duration + .6)))}>Fit</button></div>}
            <div className="editor-field-title field-top-gap">No-key options <span>FREE</span></div><div className="voice-capture-actions"><button onClick={() => void toggleRecording()} className={recording ? "record-active" : ""}>{recording ? <Square size={17} fill="currentColor" /> : <Mic2 size={17} />}{recording ? "Stop recording" : "Record my voice"}</button><input type="file" ref={audioInputRef} accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/mp4,audio/aac" className="visually-hidden-input" onChange={(event) => { const file = event.target.files?.[0]; if (file) void attachVoice(file, "uploaded"); }} /><button onClick={() => audioInputRef.current?.click()}><UploadCloud size={17} /> Import voice clip</button></div>
            <p className="editor-inspector-note">These clips are saved with your project and included in the finished video. Use a different voice recording for each character or scene.</p>
            <div className="inspector-divider" />
            <div className="editor-field-title">AI character voice <span>OPTIONAL</span></div><div className="voice-provider-switch"><button className={settings.voiceProvider === "pollinations" ? "active" : ""} onClick={() => changeSettings({ voiceProvider: "pollinations", voiceId: POLLINATIONS_VOICES[0].id })}>Kokoro voices</button><button className={settings.voiceProvider === "elevenlabs" ? "active" : ""} onClick={() => changeSettings({ voiceProvider: "elevenlabs", voiceId: voiceOptions[0]?.id || "" })}>ElevenLabs</button></div>
            {settings.voiceProvider === "pollinations" ? <><p className="provider-copy">Kokoro offers distinct character voices through Pollinations. Its current API may require credits.</p><div className="voice-presets">{POLLINATIONS_VOICES.map((voice) => <button key={voice.id} className={settings.voiceId === voice.id ? "active" : ""} onClick={() => changeSettings({ voiceId: voice.id })}><strong>{voice.name}</strong><small>{voice.description}</small></button>)}</div></> : <><p className="provider-copy">Lifelike speech with ElevenLabs. The free plan is for personal/non-commercial use; monetized uploads need a plan with commercial rights.</p>{voiceOptions.length ? <label className="field-label">Character voice<select className="field-input field-select" value={voiceOptions.some((v) => v.id === settings.voiceId) ? settings.voiceId : ""} onChange={(event) => changeSettings({ voiceId: event.target.value })}><option value="" disabled>Choose a voice</option>{voiceOptions.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.description}</option>)}</select></label> : <div className="provider-empty">{voicesError || (config.elevenLabsConfigured ? "Loading your available voices…" : "Add ELEVENLABS_API_KEY in Settings to choose a voice.")} <button onClick={onGoSettings}>Open Settings <ArrowRight size={13} /></button></div>}</>}
            <div className="voice-generate-actions"><button className="button button-primary" onClick={() => void generateVoice(false)} disabled={!!busy}><Sparkles size={15} /> Generate this scene</button><button className="button button-outline" onClick={() => void generateVoice(true)} disabled={!!busy}>Voice all scenes</button></div>
            <div className="inspector-divider" /><div className="editor-field-title">Audio mixer</div>
            <div className="mixer-row"><span><Volume2 size={15} /> Voice volume</span><strong>{settings.voiceVolume}%</strong></div><input className="studio-range" aria-label="Voice volume" type="range" min="0" max="100" value={settings.voiceVolume} onChange={(event) => changeSettings({ voiceVolume: Number(event.target.value) })} />
            <div className="editor-field-title field-top-gap">Background music</div><div className="music-choice-grid">{musicChoices.map((item) => <button key={item.id} className={settings.music === item.id ? "active" : ""} onClick={() => changeSettings({ music: item.id })}><strong>{item.label}</strong><small>{item.subtitle}</small></button>)}</div>
            <div className="mixer-row"><span><Music2 size={15} /> Music volume</span><strong>{settings.musicVolume}%</strong></div><input className="studio-range" aria-label="Music volume" type="range" min="0" max="100" value={settings.musicVolume} onChange={(event) => changeSettings({ musicVolume: Number(event.target.value) })} disabled={settings.music === "off"} />
          </div>}

          {activeTab === "text" && <div className="inspector-body text-body"><div className="inspector-intro"><span className="inspector-icon text-icon"><Captions size={18} /></span><div><h2>Words that sparkle</h2><p>Keep it short, clear and easy to follow.</p></div></div>
            <label className="field-label">Story title<input className="field-input" value={draft.title} onChange={(event) => changeProject({ title: event.target.value })} maxLength={120} /></label>
            <label className="field-label">Scene name<input className="field-input" value={selected.heading} onChange={(event) => changeScene({ heading: event.target.value })} maxLength={100} /></label>
            <label className="field-label">On-screen caption<textarea className="field-input field-textarea caption-textarea" value={selected.caption} onChange={(event) => changeScene({ caption: event.target.value })} maxLength={180} rows={3} /><span className="field-hint">Keep it under two lines for little readers. <em>{selected.caption.length}/180</em></span></label>
            <div className="editor-field-title field-top-gap">Caption look</div><div className="caption-choice-grid">{(["storybook", "comic", "subtitles"] as CaptionStyle[]).map((style) => <button key={style} className={settings.captionStyle === style ? "active" : ""} onClick={() => changeSettings({ captionStyle: style })}><span className={`caption-sample caption-sample-${style}`}><i /><i /></span>{style === "storybook" ? "Storybook" : style === "comic" ? "Speech bubble" : "Subtitles"}</button>)}</div>
            <div className="inspector-divider" /><label className="field-label">Spoken script<textarea className="field-input field-textarea narration-textarea" value={selected.narration} onChange={(event) => changeScene({ narration: event.target.value, ...(selected.audioSource === "generated" ? { audioData: undefined, audioSource: undefined } : {}) })} maxLength={450} rows={5} /><span className="field-hint">Changing this line removes generated audio; regenerate in Voice. <em>{selected.narration.split(/\s+/).filter(Boolean).length} words</em></span></label>
            <div className="inspector-divider" /><label className="field-label">Background idea<textarea className="field-input field-textarea" value={selected.visualPrompt} onChange={(event) => changeScene({ visualPrompt: event.target.value })} rows={4} maxLength={1000} /><span className="field-hint">Used only when you generate AI background art.</span></label>
            <div className="text-tip"><Sparkles size={16} /><span>For a {selectedDuration}s scene, try around {Math.max(5, Math.round(selectedDuration * 2.2))} spoken words for a natural pace.</span></div>
          </div>}

          {activeTab === "publish" && <div className="inspector-body publish-body"><div className="inspector-intro"><span className="inspector-icon youtube-icon"><TvMinimalPlay size={19} /></span><div><h2>Ready for YouTube?</h2><p>Review everything before it goes live.</p></div></div>
            {draft.youtubeVideoId && <a className="published-link" href={`https://www.youtube.com/watch?v=${draft.youtubeVideoId}`} target="_blank" rel="noopener noreferrer"><CheckCircle2 size={17} /> Uploaded to YouTube <ExternalLink size={14} /></a>}
            {scenesWithVoice < draft.scenes.length && <div className="publish-voice-note"><Info size={15} /> {draft.scenes.length - scenesWithVoice} scene{draft.scenes.length - scenesWithVoice !== 1 ? "s" : ""} without saved voice will export with music only. Add audio in the Voice tab.</div>}
            <label className="field-label">Video title<input className="field-input" value={draft.youtubeTitle} onChange={(event) => changeProject({ youtubeTitle: event.target.value })} maxLength={100} /><span className="field-hint">Tip: include #Shorts in your title.</span></label>
            <label className="field-label">Description<textarea className="field-input field-textarea" value={draft.description} onChange={(event) => changeProject({ description: event.target.value })} rows={5} maxLength={5000} /></label>
            <label className="field-label">Tags <span className="field-label-soft">separate with commas</span><input className="field-input" value={draft.tags.join(", ")} onChange={(event) => changeProject({ tags: event.target.value.split(",").map((tag) => tag.trim()) })} /></label>
            <label className="field-label">Visibility<select className="field-input field-select" value={draft.privacy} onChange={(event) => changeProject({ privacy: event.target.value as StudioProject["privacy"] })}><option value="private">Private — only you</option><option value="unlisted">Unlisted — anyone with link</option><option value="public">Public — everyone</option></select></label>
            <div className="kids-check"><input type="checkbox" id="kids-review" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><label htmlFor="kids-review"><strong>I reviewed this for children</strong><span>YouTube will be told this video is made for kids. Please watch the animation and check the words and voice before sharing.</span></label></div>
            <div className="channel-box">{config.youtubeConnected ? <><span className="connection-dot" /><span><strong>{config.youtubeChannelTitle || "Your channel"}</strong><small>YouTube connected</small></span><CheckCircle2 size={17} className="connected-icon" /></> : <><TvMinimalPlay size={20} /><span><strong>No channel connected</strong><small>Connect in Settings to upload.</small></span><button onClick={onGoSettings}>Set up <ArrowRight size={13} /></button></>}</div>
            <button className="button button-primary publish-main-button" onClick={handlePublish} disabled={!!busy || !config.youtubeConnected}><UploadCloud size={17} /> {busy === "uploading" ? "Uploading…" : busy === "rendering" ? `Rendering… ${progress}%` : "Render & upload Short"}</button>
            <p className="publish-note">Private by default. New YouTube API projects may be restricted to private uploads by Google.</p>
          </div>}
        </aside>
      </div>
      <EditorTimeline project={draft} selectedIndex={selectedIndex} playhead={playhead} onSeek={seek} onSelect={selectScene} onMove={moveScene} onDuplicate={duplicateScene} onUndo={undo} onRedo={redo} canUndo={historyRef.current.length > 0} canRedo={futureRef.current.length > 0} disabled={!!busy || recording} />
      <div className="editor-bottom-bar"><div><Clock3 size={16} /> {Math.round(total * 10) / 10} seconds <span>·</span> {draft.scenes.length} animated scenes <span>·</span> {scenesWithVoice} voiced <span>·</span> Vertical 9:16</div><div>{draft.status === "draft" && <button className="button button-outline" onClick={handleMarkReady} disabled={!!busy}><Check size={16} /> Mark ready</button>}{videoBlob && <button className="button button-light" onClick={() => downloadVideo(videoBlob, draft.title)}><Download size={16} /> Download again</button>}</div></div>
    </div>
  );
}
