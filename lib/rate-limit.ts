import "server-only";
import { rateLimits } from "./db";

// Counters live in MongoDB (serverless instances share no memory) and expire automatically.

export async function isBlocked(key: string, max: number): Promise<boolean> {
  const d = await (await rateLimits()).findOne({ _id: key });
  return !!d && d.resetAt > new Date() && d.count >= max;
}

/** Adds one to the counter and returns true if still within `max`. */
export async function consume(key: string, max: number, windowSec: number): Promise<boolean> {
  const c = await rateLimits();
  const now = new Date();
  let d = await c.findOneAndUpdate({ _id: key, resetAt: { $gt: now } }, { $inc: { count: 1 } }, { returnDocument: "after" });
  if (!d) {
    try {
      await c.updateOne({ _id: key }, { $set: { count: 1, resetAt: new Date(now.getTime() + windowSec * 1000) } }, { upsert: true });
    } catch { /* a concurrent request created it first */ }
    d = await c.findOne({ _id: key });
  }
  return !!d && d.count <= max;
}

export const addFailure = (key: string, windowSec: number) => consume(key, Number.MAX_SAFE_INTEGER, windowSec);
export const clearLimit = async (key: string) => { await (await rateLimits()).deleteOne({ _id: key }); };
