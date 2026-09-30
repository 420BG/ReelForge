import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowedMediaUrl(value: string | null) {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const hostname = parsed.hostname;
  const allowed =
    hostname === "videos.pexels.com" ||
    hostname === "images.pexels.com" ||
    hostname === "cdn.pixabay.com" ||
    hostname === "pixabay.com" ||
    hostname === "gen.pollinations.ai" ||
    hostname === "media.pollinations.ai" ||
    hostname.endsWith(".pexels.com") ||
    hostname.endsWith(".pollinations.ai");
  return allowed ? parsed : null;
}

function safeFilename(url: URL, contentType: string | null) {
  const base = url.pathname.split("/").filter(Boolean).pop()?.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "littleloop-clip";
  const extensionFromPath = /\.(mp4|webm|mov|jpg|jpeg|png|webp)$/i.test(base) ? "" : contentType?.includes("webm") ? ".webm" : contentType?.includes("png") ? ".png" : contentType?.includes("jpeg") ? ".jpg" : ".mp4";
  return `${base}${extensionFromPath}`;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Please unlock your studio first." }, { status: 401 });
  const requestUrl = new URL(request.url);
  const upstream = allowedMediaUrl(requestUrl.searchParams.get("url"));
  if (!upstream) return Response.json({ error: "That media host is not allowed." }, { status: 400 });

  try {
    const range = request.headers.get("range");
    const headers = new Headers({ Accept: "*/*" });
    if (range) headers.set("Range", range);
    const upstreamResponse = await fetch(upstream, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    });
    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      return Response.json({ error: `Media provider returned ${upstreamResponse.status}.` }, { status: 502 });
    }

    const contentType = upstreamResponse.headers.get("content-type") || (upstream.pathname.match(/\.(jpg|jpeg|png|webp)$/i) ? "image/jpeg" : "video/mp4");
    const filename = safeFilename(upstream, contentType);
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Cache-Control", "private, max-age=3600");
    responseHeaders.set("Access-Control-Allow-Origin", requestUrl.origin);
    if (requestUrl.searchParams.get("download") === "1") responseHeaders.set("Content-Disposition", `attachment; filename="${filename}"`);
    else responseHeaders.set("Content-Disposition", `inline; filename="${filename}"`);
    for (const header of ["content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
      const value = upstreamResponse.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }
    if (!responseHeaders.has("Accept-Ranges")) responseHeaders.set("Accept-Ranges", "bytes");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "The media file could not be loaded." }, { status: 502 });
  }
}
