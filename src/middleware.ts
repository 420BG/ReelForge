import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/auth";

const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/health", "/_next", "/favicon", "/icon.svg"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // external cron ping may authenticate with its shared secret instead.
  // Vercel's own Cron Jobs feature sends `Authorization: Bearer <CRON_SECRET>`
  // automatically when CRON_SECRET is set — accept that, plus a custom
  // `x-cron-secret` header for any external scheduler (cron-job.org, GitHub
  // Actions, etc.) hitting the same route.
  if (pathname === "/api/cron") {
    const bearer = req.headers.get("authorization");
    const custom = req.headers.get("x-cron-secret");
    const expected = process.env.CRON_SECRET;
    if (expected && (bearer === `Bearer ${expected}` || custom === expected)) {
      return NextResponse.next();
    }
  }

  const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"], // skip asset files with extensions
};
