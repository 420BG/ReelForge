import { getAccount, youtubeConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = youtubeConfigured();
  let acc = null;
  let error: string | null = null;
  if (configured) {
    try {
      acc = await getAccount();
    } catch (err) {
      // Keys are set; only the account lookup failed. Report that instead of "keys missing".
      console.error("youtube status lookup failed", err);
      error = err instanceof Error ? err.message.slice(0, 200) : "database error";
    }
  }
  return Response.json({
    configured,
    connected: Boolean(acc && (acc.refreshToken || acc.accessToken)),
    channelTitle: acc?.channelTitle ?? null,
    channelId: acc?.channelId ?? null,
    error,
  });
}
