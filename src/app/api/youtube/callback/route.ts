import { cookies } from "next/headers";
import { db } from "@/db";
import { studioIntegrations } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import { encryptToken, redirectUri, youtubeConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const destination = new URL("/", request.url);
  const params = new URL(request.url).searchParams;
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("littleloop_oauth_state")?.value;
  cookieStore.delete("littleloop_oauth_state");
  if (!(await isAuthenticated()) || !youtubeConfigured() || !expectedState || params.get("state") !== expectedState) {
    destination.searchParams.set("youtube", "error");
    return Response.redirect(destination);
  }
  const code = params.get("code");
  if (!code) {
    destination.searchParams.set("youtube", "cancelled");
    return Response.redirect(destination);
  }
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(request.url),
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const token = await response.json();
    if (!response.ok || !token.refresh_token || !token.access_token) throw new Error("Google did not return a refresh token.");
    let channelTitle = "Your YouTube channel";
    let channelId: string | null = null;
    let channelAvatar: string | null = null;
    const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=1", {
      headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store",
    });
    if (channelResponse.ok) {
      const channelData = await channelResponse.json();
      const channel = channelData.items?.[0];
      if (channel) {
        channelTitle = channel.snippet?.title || channelTitle;
        channelId = channel.id || null;
        channelAvatar = channel.snippet?.thumbnails?.default?.url || null;
      }
    }
    const values = {
      youtubeRefreshToken: encryptToken(token.refresh_token),
      youtubeChannelTitle: channelTitle,
      youtubeChannelId: channelId,
      youtubeChannelAvatar: channelAvatar,
      updatedAt: new Date(),
    };
    await db.insert(studioIntegrations).values({ id: 1, ...values }).onConflictDoUpdate({ target: studioIntegrations.id, set: values });
    destination.searchParams.set("youtube", "connected");
  } catch {
    destination.searchParams.set("youtube", "error");
  }
  return Response.redirect(destination);
}
