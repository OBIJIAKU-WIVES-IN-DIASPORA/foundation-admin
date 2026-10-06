import "server-only";
import { ObjectId } from "mongodb";
import { auditLogs } from "./db";
import { requestInfo } from "./request";

// Append-only trail of security-relevant events. Never put passwords, codes or tokens in `meta`.
export async function audit(action: string, o: { actor?: { id?: ObjectId | string; _id?: ObjectId; email: string }; target?: string; meta?: Record<string, string | number | boolean> } = {}) {
  try {
    const { ip, ua } = await requestInfo();
    await (await auditLogs()).insertOne({
      at: new Date(), action, ip, ua, target: o.target, meta: o.meta,
      actorId: o.actor ? new ObjectId(String(o.actor.id ?? o.actor._id)) : undefined, actorEmail: o.actor?.email,
    });
  } catch (e) {
    console.error("[audit] failed to write", action, e);
  }
}
