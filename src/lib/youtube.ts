import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { studioIntegrations } from "@/db/schema";
import type { StudioConfig } from "@/lib/types";

export function youtubeConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(requestUrl: string) {
  return process.env.GOOGLE_REDIRECT_URI || new URL("/api/youtube/callback", requestUrl).toString();
}

function encryptionKey() {
  const secret = process.env.APP_ENCRYPTION_KEY || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("Google credentials are not configured.");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export async function getIntegration() {
  const [row] = await db.select().from(studioIntegrations).limit(1);
  return row ?? null;
}

export async function getStudioConfig(): Promise<StudioConfig> {
  const integration = await getIntegration();
  return {
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    pollinationsConfigured: Boolean(process.env.POLLINATIONS_API_KEY),
    elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    pexelsConfigured: Boolean(process.env.PEXELS_API_KEY),
    pixabayConfigured: Boolean(process.env.PIXABAY_API_KEY),
    youtubeConfigured: youtubeConfigured(),
    youtubeConnected: Boolean(integration?.youtubeRefreshToken),
    youtubeChannelTitle: integration?.youtubeChannelTitle ?? null,
    youtubeChannelAvatar: integration?.youtubeChannelAvatar ?? null,
  };
}

export async function getYouTubeAccessToken() {
  const integration = await getIntegration();
  if (!integration?.youtubeRefreshToken || !youtubeConfigured()) throw new Error("Connect your YouTube channel in Settings first.");
  const refreshToken = decryptToken(integration.youtubeRefreshToken);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Your YouTube connection expired. Reconnect it in Settings.");
  return data.access_token as string;
}
