import "server-only";
import { MongoClient, type Collection } from "mongodb";
import { env, optionalEnv } from "./env";
import type { AdminChallenge, AdminDevice, AdminInvite, AdminSession, AdminUser, AuditLog, Donation } from "./types";

const g = globalThis as unknown as { _adminMongo?: Promise<MongoClient>; _adminIdx?: Promise<void> };

function client() {
  g._adminMongo ??= new MongoClient(env("MONGODB_URI"), { maxPoolSize: 5 }).connect();
  return g._adminMongo;
}

export async function db() {
  const d = (await client()).db(optionalEnv("MONGODB_DB") ?? "obijiaku");
  g._adminIdx ??= Promise.all([
    d.collection("adminUsers").createIndex({ email: 1 }, { unique: true }),
    d.collection("adminSessions").createIndex({ tokenHash: 1 }, { unique: true }),
    d.collection("adminSessions").createIndex({ userId: 1 }),
    d.collection("adminSessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    d.collection("adminChallenges").createIndex({ tokenHash: 1 }, { unique: true }),
    d.collection("adminChallenges").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    d.collection("adminInvites").createIndex({ tokenHash: 1 }, { unique: true }),
    d.collection("adminInvites").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    d.collection("adminDevices").createIndex({ tokenHash: 1 }, { unique: true }),
    d.collection("adminDevices").createIndex({ userId: 1 }),
    d.collection("adminDevices").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    d.collection("adminRateLimits").createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 }),
    d.collection("auditLogs").createIndex({ at: -1 }),
  ]).then(() => undefined);
  await g._adminIdx;
  return d;
}

const col = async <T extends object>(name: string) => (await db()).collection(name) as unknown as Collection<T & { _id: never }>;
export const users = () => col<AdminUser>("adminUsers") as unknown as Promise<Collection<AdminUser>>;
export const sessions = () => col<AdminSession>("adminSessions") as unknown as Promise<Collection<AdminSession>>;
export const challenges = () => col<AdminChallenge>("adminChallenges") as unknown as Promise<Collection<AdminChallenge>>;
export const devices = () => col<AdminDevice>("adminDevices") as unknown as Promise<Collection<AdminDevice>>;
export const invites = () => col<AdminInvite>("adminInvites") as unknown as Promise<Collection<AdminInvite>>;
export const auditLogs = () => col<AuditLog>("auditLogs") as unknown as Promise<Collection<AuditLog>>;
export const donations = () => col<Donation>("donations") as unknown as Promise<Collection<Donation>>;
export const rateLimits = async () => (await db()).collection<{ _id: string; count: number; resetAt: Date }>("adminRateLimits");
