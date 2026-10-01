import { NextResponse } from "next/server";
import { authUrl, youtubeConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!youtubeConfigured()) {
    const url = new URL("/studio/youtube", req.url);
    url.searchParams.set("yt", "unconfigured");
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(authUrl());
}
