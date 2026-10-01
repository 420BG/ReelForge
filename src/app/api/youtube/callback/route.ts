import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const back = new URL("/studio/youtube", req.url);

  if (error || !code) {
    back.searchParams.set("yt", "error");
    back.searchParams.set("ytmsg", (error ?? "no code returned").slice(0, 120));
    return NextResponse.redirect(back);
  }

  try {
    await exchangeCode(code);
    back.searchParams.set("yt", "connected");
  } catch (err) {
    console.error("youtube oauth exchange failed", err);
    back.searchParams.set("yt", "error");
    back.searchParams.set("ytmsg", (err instanceof Error ? err.message : "token exchange failed").slice(0, 120));
  }
  return NextResponse.redirect(back);
}
