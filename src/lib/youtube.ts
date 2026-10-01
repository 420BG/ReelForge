import { db } from "@/db";
import { youtubeAccounts, type YouTubeAccountRow } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pool } from "@/db";

/* ADDITIVE ONLY: the YouTube table was originally created by `drizzle-kit push`, which never ran
   on some databases (e.g. a fresh Supabase). Create it if missing — never drops or alters anything. */
const globalForYt = globalThis as typeof globalThis & { __ytTableReady?: Promise<void> };
export function ensureYouTubeTable(): Promise<void> {
  if (!globalForYt.__ytTableReady) {
    globalForYt.__ytTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS youtube_accounts (
        id serial PRIMARY KEY,
        channel_title text,
        channel_id text,
        access_token text,
        refresh_token text,
        expiry_date text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );`).then(() => undefined).catch((error) => { globalForYt.__ytTableReady = undefined; throw error; });
  }
  return globalForYt.__ytTableReady;
}

/* Hand-rolled YouTube Data API v3 OAuth + upload helpers (no SDK needed). */

export function youtubeConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function authUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${appUrl()}/api/youtube/callback`,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? "token exchange failed");
  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function exchangeCode(code: string): Promise<void> {
  const tokens = await tokenRequest({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
    redirect_uri: `${appUrl()}/api/youtube/callback`,
  });

  let channelTitle: string | null = null;
  let channelId: string | null = null;
  try {
    const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json();
    channelTitle = data.items?.[0]?.snippet?.title ?? null;
    channelId = data.items?.[0]?.id ?? null;
  } catch {
    /* channel lookup is cosmetic — tokens matter */
  }

  await ensureYouTubeTable();
  const existing = await db.select().from(youtubeAccounts).limit(1);
  const values = {
    channelTitle,
    channelId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? existing[0]?.refreshToken ?? null,
    expiryDate: String(Date.now() + tokens.expires_in * 1000),
    updatedAt: new Date(),
  };
  if (existing[0]) {
    await db
      .update(youtubeAccounts)
      .set(values)
      .where(eq(youtubeAccounts.id, existing[0].id));
  } else {
    await db.insert(youtubeAccounts).values(values);
  }
}

export async function getAccount(): Promise<YouTubeAccountRow | null> {
  await ensureYouTubeTable();
  const rows = await db.select().from(youtubeAccounts).limit(1);
  return rows[0] ?? null;
}

export async function disconnectYouTube(): Promise<void> {
  await ensureYouTubeTable();
  await db.delete(youtubeAccounts);
}

export async function freshAccessToken(acc: YouTubeAccountRow): Promise<string> {
  const expiry = Number(acc.expiryDate ?? 0);
  if (acc.accessToken && Date.now() < expiry - 60_000) return acc.accessToken;
  if (!acc.refreshToken) throw new Error("no refresh token stored — reconnect YouTube");
  const tokens = await tokenRequest({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: acc.refreshToken,
    grant_type: "refresh_token",
  });
  await db
    .update(youtubeAccounts)
    .set({
      accessToken: tokens.access_token,
      expiryDate: String(Date.now() + tokens.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(youtubeAccounts.id, acc.id));
  return tokens.access_token;
}
