import { tick } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const result = await tick();
  return Response.json({ ok: true, ...result });
}
