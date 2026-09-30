import { isAuthenticated } from "@/lib/auth";
import { runAssistant, type ChatTurn } from "@/lib/chat";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

function normalizeTurns(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((turn): turn is ChatTurn => typeof turn === "object" && turn !== null && (turn.role === "user" || turn.role === "assistant") && typeof (turn as ChatTurn).content === "string")
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 1200) }))
    .slice(-10);
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio first." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 2 || message.length > 1200) return Response.json({ error: "Send a message between 2 and 1,200 characters." }, { status: 400 });
    const history = normalizeTurns(body.history);
    const result = await runAssistant(history, message);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The assistant could not answer right now." }, { status: 500 });
  }
}
