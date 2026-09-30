import { readStored } from "@/video/storage";
import { agentUploadMetadata } from "@/content/seo";
import { getVideoRow, updateVideo } from "@/jobs/repo";
import { getIntegration } from "@/lib/youtube";
import { uploadVideoBuffer } from "@/lib/youtube-upload";
import type { StoryPlan } from "@/content/types";

/**
 * Publishes an agent video through the EXISTING YouTube integration
 * (same OAuth token, same resumable upload function). Only the content type
 * (MP4) and made-for-kids flag (per-video audience) differ from legacy uploads.
 */
export async function publishAgentVideo(videoId: string, opts: { requireApproved: boolean }) {
  const row = await getVideoRow(videoId);
  if (!row) throw new Error("Video not found.");
  if (row.youtube_video_id) return { videoId: String(row.youtube_video_id), url: `https://www.youtube.com/watch?v=${row.youtube_video_id}`, already: true };
  if (opts.requireApproved && row.workflow !== "approved") throw new Error("Approve the video before publishing.");
  const integration = await getIntegration();
  if (!integration?.youtubeRefreshToken) throw new Error("Connect your YouTube channel in Settings first.");
  const story = row.story as StoryPlan | null;
  if (!story) throw new Error("This video has no story/SEO yet.");
  if (!row.final_path) throw new Error("Render the video before publishing.");
  const bytes = await readStored(String(row.final_path)).catch(() => null);
  if (!bytes) throw new Error("The rendered MP4 is missing from storage. Use “Re-render captions/audio” or Produce to rebuild it.");
  const renderMode = String(row.render_mode ?? "video");
  const disclosure = renderMode === "image"
    ? "Visuals: AI-generated still images animated with camera motion. Narration: AI voice."
    : "Made with AI-generated video, AI voice narration and synthesized music.";
  const privacy = (["private", "unlisted", "public"].includes(String(row.privacy)) ? row.privacy : "private") as "private" | "unlisted" | "public";
  const metadata = agentUploadMetadata(story.seo, row.audience === "kids" ? "kids" : "general", privacy, disclosure);
  let youtubeId: string;
  try {
    youtubeId = await uploadVideoBuffer(bytes, { ...metadata, status: { ...metadata.status, containsSyntheticMedia: true } }, "video/mp4");
  } catch (error) {
    // Older API surfaces may reject the synthetic-media field; retry once without it (nothing was uploaded yet).
    if (error instanceof Error && /containsSyntheticMedia|unknown field|invalid.*status/i.test(error.message)) youtubeId = await uploadVideoBuffer(bytes, metadata, "video/mp4");
    else throw error;
  }
  await updateVideo(videoId, { youtube_video_id: youtubeId, workflow: "published", error: null });
  return { videoId: youtubeId, url: `https://www.youtube.com/watch?v=${youtubeId}`, already: false };
}
