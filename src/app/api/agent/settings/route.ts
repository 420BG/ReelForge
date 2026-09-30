import { fail, guard } from "@/jobs/api-helpers";
import { getConfig, saveConfig } from "@/jobs/repo";
import { captionFonts } from "@/video/composition/ffmpeg";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const fonts = await captionFonts(path.join(tmpdir(), "agent-fonts")).catch(() => ({ available: [] as string[], family: null }));
    return Response.json({ config: await getConfig(), fonts: fonts.available });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return Response.json({ config: await saveConfig(typeof body.config === "object" && body.config ? body.config : {}) });
  } catch (error) {
    return fail(error);
  }
}
