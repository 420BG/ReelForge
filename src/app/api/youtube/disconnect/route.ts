import { disconnectYouTube } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function POST() {
  await disconnectYouTube();
  return Response.json({ ok: true });
}
