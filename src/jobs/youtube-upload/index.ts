import { agentUploadMetadata, type AgentUploadMetadata } from "@/content/seo";
import { isYouTubeShort, type StoryPlan, type VideoSettings } from "@/content/types";
import { getVideoRow, updateVideo } from "@/jobs/repo";
import { freshAccessToken, getAccount } from "@/lib/youtube";
import { markCall, markFailure } from "@/lib/pipeline/usage";
import { readStored } from "@/video/storage";

/**
 * Publishes an agent video with ReelForge's EXISTING YouTube connection
 * (same youtube_accounts row, same token refresh). Made-for-kids follows the video's audience.
 */
async function resumableUpload(bytes: Buffer, metadata: AgentUploadMetadata & { status: { containsSyntheticMedia?: boolean } }) {
  const account = await getAccount();
  if (!account?.refreshToken && !account?.accessToken) throw new Error("YouTube is not connected. Connect it on the YouTube page first.");
  const token = await freshAccessToken(account);
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(bytes.length),
    },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(30_000),
  });
  if (!init.ok) {
    const text = await init.text();
    await markFailure("youtube", init.status === 403 && /quota/i.test(text));
    throw new Error(`YouTube upload init failed (${init.status}): ${text.slice(0, 300)}`);
  }
  const location = init.headers.get("location");
  if (!location?.startsWith("https://")) throw new Error("YouTube did not return an upload session.");
  const put = await fetch(location, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4", "Content-Length": String(bytes.length) },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(280_000),
  });
  const data = (await put.json().catch(() => ({}))) as { id?: string };
  if (!put.ok || !data.id) {
    await markFailure("youtube", put.status === 403);
    throw new Error(`YouTube upload failed (${put.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  await markCall("youtube");
  return data.id;
}

export async function publishAgentVideo(videoId: string, opts: { requireApproved: boolean }) {
  const row = await getVideoRow(videoId);
  if (!row) throw new Error("Video not found.");
  if (row.youtube_video_id) return { videoId: String(row.youtube_video_id), url: `https://youtu.be/${row.youtube_video_id}`, already: true };
  if (opts.requireApproved && row.workflow !== "approved") throw new Error("Approve the video before publishing.");
  const story = row.story as StoryPlan | null;
  if (!story) throw new Error("This video has no story/SEO yet.");
  if (!row.final_path) throw new Error("Render the video before publishing.");
  const bytes = await readStored(String(row.final_path)).catch(() => null);
  if (!bytes) throw new Error("The rendered MP4 is missing from storage. Re-render it first.");
  const renderMode = String(row.render_mode ?? "video");
  const warnings = Array.isArray(row.warnings) ? (row.warnings as string[]) : [];
  const stockNote = warnings.find((w) => w.startsWith("STOCK VIDEO"))?.match(/Credits: (.*)\.$/)?.[1];
  // Files the creator uploaded are described as theirs, never as AI.
  const ownMedia = warnings.find((w) => w.startsWith("YOUR MEDIA"))?.match(/^YOUR MEDIA: (\d+)\/(\d+)/);
  const ownVoice = warnings.find((w) => w.startsWith("YOUR VOICE"))?.match(/^YOUR VOICE: (\d+)\/(\d+)/);
  const allOwnVoice = Boolean(ownVoice && ownVoice[1] === ownVoice[2]);
  const voiceLine = allOwnVoice ? "Narration: recorded by the creator." : ownVoice ? "Narration: partly recorded by the creator, partly AI voice." : "Narration: AI voice.";
  const disclosure = renderMode === "upload"
    ? `Visuals: footage and images provided by the creator. ${voiceLine} Music: synthesized.`
    : ownMedia
      ? `Visuals: ${ownMedia[1]} of ${ownMedia[2]} scenes are the creator's own footage or images; the rest are AI-generated${stockNote ? ` or stock footage by ${stockNote}` : ""}. ${voiceLine}`
      : renderMode === "image"
        ? `Visuals: AI-generated images for every scene, animated with camera motion. Script and music: AI / synthesized. ${voiceLine}`
        : renderMode === "stock"
          ? `Visuals: free stock footage${stockNote ? ` by ${stockNote}` : " (Pexels/Pixabay)"}. Script: AI. ${voiceLine}`
          : renderMode === "mixed"
            ? `Visuals: AI-generated images with camera motion and AI image-to-video clips${stockNote ? `, plus stock footage by ${stockNote}` : ""}. ${voiceLine}`
            : `Made with AI-generated video and synthesized music. ${voiceLine}`;
  const privacy = (["private", "unlisted", "public"].includes(String(row.privacy)) ? row.privacy : "private") as "private" | "unlisted" | "public";
  const metadata = agentUploadMetadata(story.seo, row.audience === "kids" ? "kids" : "general", privacy, disclosure, isYouTubeShort({ ...(row.settings as VideoSettings), aspect: story.aspect ?? (row.settings as VideoSettings | null)?.aspect }, Number(row.duration_sec) || null) ? "short" : "long");
  let youtubeId: string;
  try {
    // Altered/synthetic-content flag: on for anything AI-made; off only when both picture and voice are the creator's own.
    youtubeId = await resumableUpload(bytes, { ...metadata, status: { ...metadata.status, containsSyntheticMedia: !(renderMode === "upload" && allOwnVoice) } });
  } catch (error) {
    // Nothing is uploaded before the session starts, so one retry without the synthetic-media flag is safe.
    if (error instanceof Error && /containsSyntheticMedia|unknown field|invalid.*status/i.test(error.message)) youtubeId = await resumableUpload(bytes, metadata);
    else throw error;
  }
  await updateVideo(videoId, { youtube_video_id: youtubeId, workflow: "published", error: null });
  return { videoId: youtubeId, url: `https://youtu.be/${youtubeId}`, already: false };
}
