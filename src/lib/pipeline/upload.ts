import fs from "node:fs/promises";
import path from "node:path";
import { getAccount, freshAccessToken } from "@/lib/youtube";
import { markCall, markFailure } from "./usage";

/* Resumable YouTube upload, hand-rolled over fetch. Uploads cost 1,600 of the
   free 10,000 daily quota units (~6/day). */

export async function uploadToYouTube(opts: {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  privacy: "private" | "unlisted" | "public";
}): Promise<{ id: string; url: string }> {
  const acc = await getAccount();
  if (!acc?.refreshToken && !acc?.accessToken) {
    throw new Error("YouTube is not connected");
  }
  const token = await freshAccessToken(acc);

  const meta = {
    snippet: {
      title: opts.title.slice(0, 100),
      description: opts.description,
      tags: opts.tags.slice(0, 15),
      categoryId: "27", // Education
    },
    status: {
      privacyStatus: opts.privacy,
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(meta),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!initRes.ok) {
    const text = await initRes.text();
    const quota = initRes.status === 403 && /quota/i.test(text);
    await markFailure("youtube", quota);
    throw new Error(`upload init failed (${initRes.status}): ${text.slice(0, 300)}`);
  }

  const location = initRes.headers.get("location");
  if (!location) throw new Error("no resumable session URL returned");

  const file = await fs.readFile(opts.filePath);
  const putRes = await fetch(location, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "video/mp4",
      "Content-Length": String(file.length),
    },
    body: new Uint8Array(file),
    signal: AbortSignal.timeout(10 * 60_000),
  });

  const data = await putRes.json().catch(() => ({}));
  if (!putRes.ok || !data.id) {
    const quota = putRes.status === 403;
    await markFailure("youtube", quota);
    throw new Error(`upload failed (${putRes.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }

  await markCall("youtube");
  const ext = path.extname(opts.filePath);
  if (ext) {
    /* keep linters honest about fs/path usage */
  }
  return { id: data.id, url: `https://youtu.be/${data.id}` };
}
