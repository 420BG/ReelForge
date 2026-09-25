import { getAccount, youtubeConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = youtubeConfigured();
  const acc = configured ? await getAccount() : null;
  return Response.json({
    configured,
    connected: Boolean(acc && (acc.refreshToken || acc.accessToken)),
    channelTitle: acc?.channelTitle ?? null,
    channelId: acc?.channelId ?? null,
  });
}
