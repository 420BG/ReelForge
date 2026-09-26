import { db } from "@/db";
import { videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSignedUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!v) return new Response("not found", { status: 404 });

  const wantThumb = new URL(req.url).searchParams.has("thumb");
  const key = wantThumb ? v.thumbRel : v.videoRel;
  if (!key) return new Response("no file", { status: 404 });

  try {
    const url = await getSignedUrl(key, 3600);
    return Response.redirect(url, 302);
  } catch (err) {
    console.error("signed url failed", err);
    return new Response("storage error", { status: 502 });
  }
}
