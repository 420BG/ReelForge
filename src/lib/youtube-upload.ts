import { getYouTubeAccessToken } from "@/lib/youtube";
import type { StudioProject } from "@/lib/types";

export type UploadMetadata = {
  snippet: { title: string; description: string; tags: string[]; categoryId: string };
  status: { privacyStatus: "private" | "unlisted" | "public"; selfDeclaredMadeForKids: boolean; containsSyntheticMedia?: boolean };
};

export function uploadMetadata(project: StudioProject, privacy?: "private" | "unlisted" | "public"): UploadMetadata {
  const baseTitle = (project.youtubeTitle || project.title).slice(0, 90);
  const title = baseTitle.toLowerCase().includes("#shorts") ? baseTitle : `${baseTitle} #Shorts`;
  return {
    snippet: {
      title: title.slice(0, 100),
      description: (project.description || "").slice(0, 5000),
      tags: project.tags.slice(0, 20),
      categoryId: "1",
    },
    status: {
      privacyStatus: privacy || (["private", "unlisted", "public"].includes(project.privacy) ? project.privacy : "private"),
      selfDeclaredMadeForKids: true,
    },
  };
}

async function errorMessage(response: Response) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.error_description || `YouTube returned ${response.status}`;
  } catch {
    return `YouTube returned ${response.status}`;
  }
}

export async function uploadVideoBuffer(bytes: Buffer, metadata: UploadMetadata, contentType: "video/webm" | "video/mp4" = "video/webm"): Promise<string> {
  const accessToken = await getYouTubeAccessToken();
  const initiate = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      "X-Upload-Content-Length": String(bytes.length),
    },
    body: JSON.stringify(metadata),
    cache: "no-store",
  });
  if (!initiate.ok) throw new Error(await errorMessage(initiate));
  const uploadUrl = initiate.headers.get("location");
  if (!uploadUrl || !uploadUrl.startsWith("https://")) throw new Error("YouTube did not start an upload session.");
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType, "Content-Length": String(bytes.length) },
    body: new Uint8Array(bytes),
    cache: "no-store",
  });
  if (!upload.ok) throw new Error(await errorMessage(upload));
  const result = await upload.json();
  if (!result.id) throw new Error("YouTube did not return a video ID. Check YouTube Studio.");
  return result.id as string;
}
