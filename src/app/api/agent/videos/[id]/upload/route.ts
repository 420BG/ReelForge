import type { StoryPlan } from "@/content/types";
import { fail, guard, UUID } from "@/jobs/api-helpers";
import { getAssets, getVideo, getVideoRow, resetAssets, updateVideo, wakeJob } from "@/jobs/repo";
import { clearScratch, materialize } from "@/video/storage";
import {
  assembleUpload, CHUNK_BYTES, classifyUpload, ingestClip, ingestNarration, ingestVoice, MAX_BYTES, newUploadToken, parseUploadToken,
  saveUploadChunk, speechToTextAvailable, transcribe, UPLOAD_PROVIDER, type UploadKind,
} from "@/video/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };
const KINDS: UploadKind[] = ["clip", "voice", "narration"];
const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;
const subtitleText = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 700);

/** One chunk of a file (raw bytes). Chunks are small so they fit Vercel's request limit. */
export async function PUT(request: Request, context: Context) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Invalid id." }, { status: 400 });
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? "";
    if (!parseUploadToken(token)) return Response.json({ error: "Invalid upload token." }, { status: 400 });
    if (!(await getVideoRow(id))) return Response.json({ error: "Not found." }, { status: 404 });
    await saveUploadChunk(id, token, Number(url.searchParams.get("chunk")), Buffer.from(await request.arrayBuffer()));
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

/**
 * start     – begin an upload (checks type/size, returns a token and the chunk size)
 * finish    – assemble the chunks and auto-adjust the file into the scene (fit, trim, level, cut)
 * remove    – stop using your upload for a scene (AI makes it again on the next render)
 * subtitle  – write a scene's subtitle text from its recording (speech-to-text)
 */
export async function POST(request: Request, context: Context) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Invalid id." }, { status: 400 });
  try {
    const row = await getVideoRow(id);
    if (!row) return Response.json({ error: "Not found." }, { status: 404 });
    if (row.workflow === "published") return Response.json({ error: "This video is already published." }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const story = row.story as StoryPlan | null;
    if (!story?.scenes?.length) return Response.json({ error: "Write the script first — uploads attach to its scenes." }, { status: 400 });
    const validScene = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) < story.scenes.length;

    if (action === "start") {
      const kind = KINDS.includes(body.kind) ? (body.kind as UploadKind) : null;
      if (!kind) return Response.json({ error: "Unknown upload type." }, { status: 400 });
      const scene = kind === "narration" ? 0 : Number(body.scene);
      if (!validScene(scene)) return Response.json({ error: "Invalid scene." }, { status: 400 });
      const size = Number(body.size) || 0;
      if (size <= 0) return Response.json({ error: "That file is empty." }, { status: 400 });
      if (size > MAX_BYTES[kind]) return Response.json({ error: `That file is ${mb(size)} — the limit is ${mb(MAX_BYTES[kind])}. Trim it or export a smaller version.` }, { status: 400 });
      classifyUpload(kind, String(body.name ?? ""), String(body.type ?? "")); // throws a clear message for wrong types
      return Response.json({ token: newUploadToken(kind, scene), chunkSize: CHUNK_BYTES, chunks: Math.ceil(size / CHUNK_BYTES) });
    }

    if (action === "finish") {
      const parsed = parseUploadToken(String(body.token ?? ""));
      if (!parsed || !validScene(parsed.scene)) return Response.json({ error: "Invalid upload." }, { status: 400 });
      const name = String(body.name ?? "upload").slice(0, 160);
      const { ext, media } = classifyUpload(parsed.kind, name, String(body.type ?? ""));
      const notes: string[] = [];
      try {
        const file = await assembleUpload(id, String(body.token), Number(body.chunks), ext);
        if (parsed.kind === "clip") {
          const result = await ingestClip(id, parsed.scene, file, media === "image" ? "image" : "video", name);
          notes.push(result.mode === "image"
            ? `Scene ${parsed.scene + 1} now uses your image (${result.width}×${result.height}) — it's cropped to the frame and gets camera motion.`
            : `Scene ${parsed.scene + 1} now uses your clip (${result.duration.toFixed(1)}s) — it's cropped to the frame and fitted to the narration length.`);
        } else if (parsed.kind === "voice") {
          const result = await ingestVoice(id, parsed.scene, file, name);
          notes.push(`Scene ${parsed.scene + 1} now uses your recording (${result.duration.toFixed(1)}s, silence trimmed, volume levelled). The scene's length follows it.`);
          if (body.subtitle !== false && speechToTextAvailable()) {
            const heard = await transcribe(result.file);
            if (heard?.text) {
              const next: StoryPlan = { ...story, scenes: story.scenes.map((scene) => (scene.index === parsed.scene ? { ...scene, narration: subtitleText(heard.text) } : scene)) };
              await updateVideo(id, { story: next });
              notes.push("Subtitle text was written from your recording — edit it if a word is wrong.");
            } else notes.push("Couldn't write the subtitle automatically, so the scene's existing text is used — edit it to match your recording.");
          }
        } else {
          const result = await ingestNarration(id, story, file, name);
          notes.push(`Your ${result.duration.toFixed(0)}s narration was levelled and cut into ${result.pieces.length} scenes at natural pauses. Every scene's length now follows your voice.`);
          if (body.subtitle === true && speechToTextAvailable()) {
            const started = Date.now();
            const texts = new Map<number, string>();
            for (const piece of result.pieces) {
              if (Date.now() - started > 150_000) break;
              const heard = await transcribe(piece.file);
              if (heard?.text) texts.set(piece.scene, subtitleText(heard.text));
            }
            if (texts.size) {
              await updateVideo(id, { story: { ...story, scenes: story.scenes.map((scene) => (texts.has(scene.index) ? { ...scene, narration: texts.get(scene.index)! } : scene)) } });
              notes.push(`Subtitles were written from your voice for ${texts.size}/${result.pieces.length} scenes.`);
            }
          }
        }
      } finally {
        if (process.env.VERCEL) await clearScratch(id).catch(() => undefined);
      }
      await wakeJob(id);
      return Response.json({ video: await getVideo(id), note: notes.join(" ") });
    }

    if (action === "remove") {
      const kind = body.kind === "voice" ? "voice" : body.kind === "clip" ? "clip" : null;
      if (!kind || !validScene(body.scene)) return Response.json({ error: "Invalid request." }, { status: 400 });
      await resetAssets(id, [Number(body.scene)], kind === "clip" ? ["clip", "keyframe"] : ["voice"], true);
      return Response.json({ video: await getVideo(id), note: `Scene ${Number(body.scene) + 1}: your ${kind === "clip" ? "clip" : "recording"} was removed — AI will make it on the next render.` });
    }

    if (action === "subtitle") {
      if (!validScene(body.scene)) return Response.json({ error: "Invalid scene." }, { status: 400 });
      if (!speechToTextAvailable()) return Response.json({ error: "Auto-subtitles need a GROQ_API_KEY, DEEPGRAM_API_KEY or GEMINI_API_KEY. You can type the subtitle text instead." }, { status: 400 });
      const voice = (await getAssets(id, "voice")).find((asset) => asset.scene_index === Number(body.scene));
      if (voice?.status !== "done" || !voice.path) return Response.json({ error: "This scene has no narration audio yet." }, { status: 400 });
      if (voice.provider !== UPLOAD_PROVIDER) return Response.json({ error: "This scene's voice is AI narration — it already speaks the text exactly." }, { status: 400 });
      try {
        const heard = await transcribe(await materialize(voice.path, id));
        if (!heard?.text) return Response.json({ error: "Speech-to-text is busy right now. Try again, or type the subtitle text." }, { status: 400 });
        await updateVideo(id, { story: { ...story, scenes: story.scenes.map((scene) => (scene.index === Number(body.scene) ? { ...scene, narration: subtitleText(heard.text) } : scene)) } });
      } finally {
        if (process.env.VERCEL) await clearScratch(id).catch(() => undefined);
      }
      return Response.json({ video: await getVideo(id), note: `Scene ${Number(body.scene) + 1}: subtitle text written from the audio.` });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
