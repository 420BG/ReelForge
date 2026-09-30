import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { guard, UUID } from "@/jobs/api-helpers";
import { getAssets, getVideoRow } from "@/jobs/repo";
import { localPathFor, signedUrl } from "@/video/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp3: "audio/mpeg" };

/** Streams agent media to the signed-in owner only, with Range support for scrubbing. Paths never leave the server. */
export async function GET(request: Request, context: Context) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Invalid id." }, { status: 400 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "final";
  const row = await getVideoRow(id);
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  let key: string | null = null;
  if (kind === "final") key = (row.final_path as string) ?? null;
  else if (kind === "cover") key = (row.cover_path as string) ?? null;
  else if (["clip", "keyframe", "voice"].includes(kind)) {
    const scene = Number(url.searchParams.get("scene"));
    const asset = (await getAssets(id, kind)).find((item) => item.scene_index === scene);
    key = asset?.status === "done" ? asset.path : null;
  }
  if (!key) return Response.json({ error: "File not available." }, { status: 404 });
  const ext0 = key.split(".").pop()?.toLowerCase() ?? "mp4";
  const niceName = `${String(row.title || "short").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "short"}.${ext0}`;
  // Supabase Storage: owner is already verified above → short-lived signed URL (supports Range, no Vercel size limits).
  const signed = await signedUrl(key, 900, url.searchParams.get("download") === "1" ? niceName : undefined);
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, no-store" } });
  const file = localPathFor(key);
  if (!file) return Response.json({ error: "File storage is not reachable." }, { status: 502 });
  let size: number;
  try { size = (await stat(file)).size; } catch { return Response.json({ error: "File is missing on the server (re-render to restore it)." }, { status: 404 }); }

  const ext = file.split(".").pop()?.toLowerCase() ?? "mp4";
  const headers = new Headers({ "Content-Type": TYPES[ext] ?? "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" });
  if (url.searchParams.get("download") === "1") {
    const name = String(row.title || "short").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "short";
    headers.set("Content-Disposition", `attachment; filename="${name}.${ext}"`);
  }
  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match) {
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers });
}
