import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { isAuthenticated } from "@/lib/auth";
import { redirectUri, youtubeConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return Response.redirect(new URL("/?youtube=unlock", request.url));
  if (!youtubeConfigured()) return Response.redirect(new URL("/?youtube=configure", request.url));
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("littleloop_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri(request.url));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return Response.redirect(url);
}
