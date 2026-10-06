import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { isProd } from "./env";
import { newToken, sha256 } from "./crypto";
import { devices, sessions, users } from "./db";
import type { AdminDevice } from "./types";
import { requestInfo } from "./request";
import type { SessionUser } from "./types";

export const IDLE_MS = 30 * 60_000; // sign out after 30 minutes without activity
export const ABSOLUTE_MS = 12 * 3_600_000; // and never keep a session longer than 12 hours

// "__Host-" makes the cookie host-only and Secure-only. Browsers refuse it over plain http, so only in production.
export const SESSION_COOKIE = isProd ? "__Host-admin_session" : "admin_session";
export const CHALLENGE_COOKIE = isProd ? "__Host-admin_challenge" : "admin_challenge";

export const DEVICE_COOKIE = isProd ? "__Host-admin_device" : "admin_device";
const DEVICE_TTL_MS = 90 * 86_400_000;

export const cookieOptions = (maxAgeMs: number) => ({
  httpOnly: true, secure: isProd, sameSite: "strict" as const, path: "/", maxAge: Math.floor(maxAgeMs / 1000),
});

export async function createSession(userId: ObjectId) {
  const token = newToken();
  const { ip, ua } = await requestInfo();
  const now = new Date();
  await (await sessions()).insertOne({
    tokenHash: sha256(token), userId, createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + ABSOLUTE_MS), ip, ua,
  } as never);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(ABSOLUTE_MS));
}

export type Verified = { sessionId: string; user: SessionUser };

// The role is read from the database on every request, never from the cookie.
export const getSession = cache(async (): Promise<Verified | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const col = await sessions();
  const now = new Date();
  const s = await col.findOne({ tokenHash: sha256(token), expiresAt: { $gt: now }, lastSeenAt: { $gt: new Date(now.getTime() - IDLE_MS) } });
  if (!s) return null;
  const u = await (await users()).findOne({ _id: s.userId, status: "active" });
  if (!u) { await col.deleteOne({ _id: s._id }); return null; }
  if (now.getTime() - s.lastSeenAt.getTime() > 60_000) await col.updateOne({ _id: s._id }, { $set: { lastSeenAt: now } });
  return { sessionId: String(s._id), user: { id: String(u._id), email: u.email, name: u.name, role: u.role, totpEnabled: !!u.totp } };
});

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await (await sessions()).deleteOne({ tokenHash: sha256(token) });
  jar.delete(SESSION_COOKIE);
}

export async function revokeUserSessions(userId: ObjectId | string, exceptSessionId?: string) {
  const filter: Record<string, unknown> = { userId: new ObjectId(String(userId)) };
  if (exceptSessionId) filter._id = { $ne: new ObjectId(exceptSessionId) };
  await (await sessions()).deleteMany(filter);
}

// ---- Trusted devices -------------------------------------------------------------------------
// Why: an attacker who only knows an email address can trip the failed-login lockout and keep the real
// owner out. A browser that has fully signed in before carries a secret cookie the attacker cannot
// have, so the owner's usual browsers are exempt from lockouts caused by untrusted traffic.
// A trusted browser still needs the password and the second step every time.

export async function findTrustedDevice(userId: ObjectId): Promise<AdminDevice | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  return (await devices()).findOne({ tokenHash: sha256(token), userId, expiresAt: { $gt: new Date() } });
}

export async function trustThisDevice(userId: ObjectId, existing: AdminDevice | null) {
  const jar = await cookies();
  const now = new Date(), expiresAt = new Date(now.getTime() + DEVICE_TTL_MS);
  const col = await devices();
  if (existing) {
    await col.updateOne({ _id: existing._id }, { $set: { lastUsedAt: now, expiresAt } });
    const raw = jar.get(DEVICE_COOKIE)?.value;
    if (raw) jar.set(DEVICE_COOKIE, raw, cookieOptions(DEVICE_TTL_MS));
    return;
  }
  const token = newToken();
  const { ua } = await requestInfo();
  await col.insertOne({ tokenHash: sha256(token), userId, createdAt: now, lastUsedAt: now, expiresAt, ua } as never);
  jar.set(DEVICE_COOKIE, token, cookieOptions(DEVICE_TTL_MS));
}

export async function forgetDevices(userId: ObjectId | string) {
  await (await devices()).deleteMany({ userId: new ObjectId(String(userId)) });
}
