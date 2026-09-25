import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { STORAGE } from "@/lib/pipeline/render";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!v) return new Response("not found", { status: 404 });

  const wantThumb = new URL(req.url).searchParams.has("thumb");
  const rel = wantThumb ? v.thumbRel : v.videoRel;
  if (!rel) return new Response("no file", { status: 404 });

  const full = path.join(STORAGE, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!full.startsWith(STORAGE)) return new Response("forbidden", { status: 403 });

  let stat;
  try {
    stat = await fs.stat(full);
  } catch {
    return new Response("no file", { status: 404 });
  }
  const data = new Uint8Array(await fs.readFile(full));

  if (wantThumb) {
    return new Response(data, {
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(stat.size) },
    });
  }

  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
    return new Response(data.subarray(start, end + 1), {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new Response(data, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="reelforge-${id}.mp4"`,
    },
  });
}
