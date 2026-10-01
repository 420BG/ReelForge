import { fail, guard } from "@/jobs/api-helpers";
import { getConfig, saveConfig } from "@/jobs/repo";
import { PAID_PROVIDER_IDS, type AgentConfig } from "@/content/types";
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
    const patch = (typeof body.config === "object" && body.config ? body.config : {}) as Partial<AgentConfig>;
    // Money safety: turning Free Mode off or switching a paid provider on needs an explicit confirmation
    // from the confirmation dialog — enforced here, not just in the UI.
    const current = await getConfig();
    const turningFreeModeOff = current.freeMode && patch.freeMode === false;
    const enablingPaid = PAID_PROVIDER_IDS.filter((id) => !current.providers[id]?.enabled && patch.providers?.[id]?.enabled === true);
    if ((turningFreeModeOff || enablingPaid.length) && body.confirmPaid !== true) {
      return Response.json({ error: "Paid AI providers may incur API charges. Confirm in the dialog to enable them.", needsConfirmation: true, config: current }, { status: 409 });
    }
    return Response.json({ config: await saveConfig(patch) });
  } catch (error) {
    return fail(error);
  }
}
