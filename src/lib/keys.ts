import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import type { AutoSettings } from "@/lib/types";
import { eq } from "drizzle-orm";

export const SECRET_NAMES = [
  "OPENROUTER_API_KEY",
  "POLLINATIONS_API_KEY",
  "ELEVENLABS_API_KEY",
  "PEXELS_API_KEY",
  "PIXABAY_API_KEY",
  "FAL_KEY",
  "REPLICATE_API_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

export type SecretName = (typeof SECRET_NAMES)[number];

export type SecretStatus = { name: SecretName; configured: boolean; masked: string };

const DEFAULT_AUTO: AutoSettings = { enabled: false, autoPost: false, visibility: "private", lastRunDate: null };

let hydrated = false;
let hydration: Promise<void> | null = null;

/**
 * Applies secrets stored through Settings to this server process.
 * Database wins over the environment so pasted keys work immediately and survive restarts.
 */
export function hydrateSecrets() {
  if (hydrated) return Promise.resolve();
  if (!hydration) {
    hydration = (async () => {
      try {
        const [row] = await db.select().from(studioSettings).where(eq(studioSettings.id, 1)).limit(1);
        const stored = row?.secrets || {};
        for (const name of SECRET_NAMES) {
          const value = stored[name];
          if (typeof value === "string" && value.trim()) process.env[name] = value;
        }
      } catch {
        // A fresh database simply falls back to environment variables.
      } finally {
        hydrated = true;
        hydration = null;
      }
    })();
  }
  return hydration;
}

export function secretStatus(): SecretStatus[] {
  return SECRET_NAMES.map((name) => {
    const value = process.env[name] || "";
    return { name, configured: Boolean(value), masked: value ? `${value.slice(0, 3)}••••${value.slice(-4)}` : "" };
  });
}

export async function saveSecrets(updates: Partial<Record<SecretName, string>>, clears: SecretName[] = []) {
  await hydrateSecrets();
  const [row] = await db.select().from(studioSettings).where(eq(studioSettings.id, 1)).limit(1);
  const stored = { ...(row?.secrets || {}) };
  let changed = false;
  for (const name of SECRET_NAMES) {
    const value = updates[name];
    if (typeof value === "string" && value.trim()) {
      stored[name] = value.trim().slice(0, 500);
      process.env[name] = stored[name];
      changed = true;
    }
    if (clears.includes(name)) {
      delete stored[name];
      delete process.env[name];
      changed = true;
    }
  }
  if (!changed) return;
  await db.insert(studioSettings).values({ id: 1, secrets: stored, updatedAt: new Date() })
    .onConflictDoUpdate({ target: studioSettings.id, set: { secrets: stored, updatedAt: new Date() } });
}

export async function getAutoSettings(): Promise<AutoSettings> {
  await hydrateSecrets();
  try {
    const [row] = await db.select().from(studioSettings).where(eq(studioSettings.id, 1)).limit(1);
    return { ...DEFAULT_AUTO, ...(row?.auto || {}) };
  } catch {
    return DEFAULT_AUTO;
  }
}

export async function saveAutoSettings(patch: Partial<AutoSettings>): Promise<AutoSettings> {
  const current = await getAutoSettings();
  const next: AutoSettings = {
    enabled: Boolean(patch.enabled ?? current.enabled),
    autoPost: Boolean(patch.autoPost ?? current.autoPost),
    visibility: patch.visibility === "unlisted" || patch.visibility === "public" ? patch.visibility : patch.visibility === "private" ? "private" : current.visibility,
    lastRunDate: patch.lastRunDate === undefined ? current.lastRunDate : patch.lastRunDate,
  };
  await db.insert(studioSettings).values({ id: 1, auto: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: studioSettings.id, set: { auto: next, updatedAt: new Date() } });
  return next;
}
