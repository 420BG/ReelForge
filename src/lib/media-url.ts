export function isSafeMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1600) return false;
  if (value.startsWith("/api/media/proxy?url=")) return true;
  if (value.startsWith("data:image/")) return value.length < 8_000_000;
  if (/^data:video\/(mp4|webm);base64,/.test(value)) return value.length < 12_000_000;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return ["videos.pexels.com", "images.pexels.com", "cdn.pixabay.com", "pixabay.com", "gen.pollinations.ai", "media.pollinations.ai"].includes(url.hostname)
      || url.hostname.endsWith(".pexels.com")
      || url.hostname.endsWith(".pollinations.ai");
  } catch {
    return false;
  }
}

export function safeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
