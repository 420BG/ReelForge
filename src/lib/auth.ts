import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { ensureStudioSchema } from "@/db/bootstrap";
import { studioOwner, studioSessions } from "@/db/schema";

const COOKIE_NAME = "littleloop_session";
const SESSION_DAYS = 30;

export function hashPin(pin: string) {
  const salt = randomBytes(24).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string) {
  try {
    const [salt, expectedHex] = stored.split(":");
    const expected = Buffer.from(expectedHex, "hex");
    const actual = scryptSync(pin, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getOwner() {
  await ensureStudioSchema();
  const { hydrateSecrets } = await import("@/lib/keys");
  await hydrateSecrets();
  const [owner] = await db.select().from(studioOwner).limit(1);
  return owner ?? null;
}

export async function getAuthState(): Promise<"setup" | "locked" | "authenticated"> {
  const owner = await getOwner();
  if (!owner) return "setup";
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return "locked";
  const [session] = await db.select().from(studioSessions).where(and(eq(studioSessions.tokenHash, tokenHash(token)), gt(studioSessions.expiresAt, new Date()))).limit(1);
  return session ? "authenticated" : "locked";
}

export async function isAuthenticated() {
  return (await getAuthState()) === "authenticated";
}

export async function createSession() {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(studioSessions).values({ tokenHash: tokenHash(token), expiresAt });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) await db.delete(studioSessions).where(eq(studioSessions.tokenHash, tokenHash(token)));
  cookieStore.delete(COOKIE_NAME);
}

export async function registerOwner(pin: string) {
  if (pin.length < 6 || pin.length > 64) throw new Error("Use a PIN or passphrase with at least 6 characters.");
  const existing = await getOwner();
  if (existing) throw new Error("This studio already has an owner.");
  await db.insert(studioOwner).values({ id: 1, pinHash: hashPin(pin) });
  await createSession();
}

export async function signInOwner(pin: string) {
  const owner = await getOwner();
  if (!owner) throw new Error("Set up your studio first.");
  if (owner.lockedUntil && owner.lockedUntil > new Date()) {
    throw new Error("Too many attempts. Please try again in 15 minutes.");
  }
  if (!verifyPin(pin, owner.pinHash)) {
    const attempts = owner.failedAttempts + 1;
    await db.update(studioOwner).set({
      failedAttempts: attempts >= 5 ? 0 : attempts,
      lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
    }).where(eq(studioOwner.id, owner.id));
    throw new Error(attempts >= 5 ? "Too many attempts. Please try again in 15 minutes." : "That PIN doesn't look right. Please try again.");
  }
  await db.update(studioOwner).set({ failedAttempts: 0, lockedUntil: null }).where(eq(studioOwner.id, owner.id));
  await createSession();
}
