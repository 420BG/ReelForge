import { db } from "@/db";
import { waitlist } from "@/db/schema";
import { count, eq, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "That email doesn't look right." }, { status: 422 });
  }
  const name = body.name ? String(body.name).trim().slice(0, 120) : null;
  const source = String(body.source ?? "site").slice(0, 60);

  try {
    const inserted = await db
      .insert(waitlist)
      .values({ email, name, source })
      .onConflictDoNothing({ target: waitlist.email })
      .returning({ id: waitlist.id });

    let duplicate = false;
    let id = inserted[0]?.id;

    if (!id) {
      duplicate = true;
      const existing = await db
        .select({ id: waitlist.id })
        .from(waitlist)
        .where(eq(waitlist.email, email))
        .limit(1);
      id = existing[0]?.id;
    }

    let position = 1;
    if (id) {
      const rows = await db
        .select({ value: count() })
        .from(waitlist)
        .where(lte(waitlist.id, id));
      position = Number(rows[0]?.value ?? 1);
    }

    return Response.json({ ok: true, position, duplicate });
  } catch (err) {
    console.error("waitlist insert failed", err);
    return Response.json({ error: "The list glitched — try again." }, { status: 500 });
  }
}
