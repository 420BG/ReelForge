import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, appPassword, authRequired, createSessionValue } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let password = "";
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = await req.json();
      password = String(body.password ?? "");
    } else {
      const fd = await req.formData().catch(() => new FormData());
      password = String(fd.get("password") ?? "");
    }
  } catch {
    /* empty password */
  }

  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "http://localhost:3000";

  // key only matters if the operator enabled one via APP_PASSWORD
  if (authRequired() && password !== appPassword()) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
  return NextResponse.redirect(new URL("/studio", origin), { status: 303 });
}
