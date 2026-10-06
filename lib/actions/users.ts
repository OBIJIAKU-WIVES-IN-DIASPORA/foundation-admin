"use server";

import { ObjectId } from "mongodb";
import { invites, users } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { reauth } from "@/lib/reauth";
import { newToken, sha256 } from "@/lib/crypto";
import { forgetDevices, revokeUserSessions } from "@/lib/session";
import { audit } from "@/lib/audit";
import { sendInvite } from "@/lib/mail";
import { env } from "@/lib/env";
import { consume } from "@/lib/rate-limit";
import { inviteSchema, objectId, first, type FormState } from "@/lib/validation";
import { revalidatePath } from "next/cache";

async function sendLink(userId: ObjectId, email: string, name: string) {
  const token = newToken();
  await (await invites()).deleteMany({ userId, usedAt: { $exists: false } });
  await (await invites()).insertOne({ tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + 24 * 3_600_000) } as never);
  await sendInvite(email, name, `${env("ADMIN_URL").replace(/\/$/, "")}/invite/${token}`);
}

// Only the SuperAdmin can create accounts, and only with the "admin" role. SuperAdmin is created from the command line.
export async function inviteAdmin(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("superAdmin");
  const p = inviteSchema.safeParse({ email: fd.get("email"), name: fd.get("name"), password: fd.get("password") });
  if (!p.success) return { ok: false, message: first(p.error) };
  const keep = { email: p.data.email, name: p.data.name };
  const bad = await reauth(me, p.data.password);
  if (bad) return { ok: false, message: bad, values: keep };
  if (!(await consume(`invite:${me.id}`, 10, 3600))) return { ok: false, message: "Too many invitations. Try again later." };

  const col = await users();
  const existing = await col.findOne({ email: p.data.email });
  if (existing && existing.status !== "invited") return { ok: false, message: "An account with that email already exists.", values: keep };
  const id = existing?._id ?? (await col.insertOne({ email: p.data.email, name: p.data.name, role: "admin", status: "invited", createdAt: new Date(), createdBy: new ObjectId(me.id) } as never)).insertedId;
  try {
    await sendLink(id, p.data.email, p.data.name);
  } catch (e) {
    console.error("[users] invite email failed", e);
    return { ok: false, message: "The account was created but the email failed to send. Use “Send link again” in the list." };
  }
  await audit("user.invited", { actor: me, target: p.data.email });
  revalidatePath("/users");
  return { ok: true, message: `Invitation sent to ${p.data.email}.` };
}

async function target(id: string) {
  if (!objectId.safeParse(id).success) return null;
  const u = await (await users()).findOne({ _id: new ObjectId(id) });
  return u && u.role === "admin" ? u : null; // the SuperAdmin can't be changed from the web UI
}

export async function userAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("superAdmin");
  const op = String(fd.get("op") ?? "");
  const bad = await reauth(me, String(fd.get("password") ?? ""));
  if (bad) return { ok: false, message: bad };
  const u = await target(String(fd.get("userId") ?? ""));
  if (!u) return { ok: false, message: "User not found." };
  const col = await users();

  if (op === "disable" || op === "enable") {
    await col.updateOne({ _id: u._id }, { $set: { status: op === "disable" ? "disabled" : u.passwordHash ? "active" : "invited" } });
    if (op === "disable") { await revokeUserSessions(u._id); await forgetDevices(u._id); }
  } else if (op === "reset2fa") {
    await col.updateOne({ _id: u._id }, { $unset: { totp: "", totpPending: "" } });
    await revokeUserSessions(u._id);
    await forgetDevices(u._id);
  } else if (op === "signout") {
    await revokeUserSessions(u._id);
    await forgetDevices(u._id);
  } else if (op === "link") {
    if (u.status === "disabled") return { ok: false, message: "Enable the account first." };
    try { await sendLink(u._id, u.email, u.name); } catch { return { ok: false, message: "The email failed to send." }; }
  } else return { ok: false, message: "Unknown action." };

  await audit(`user.${op}`, { actor: me, target: u.email });
  revalidatePath("/users");
  return { ok: true, message: "Done." };
}
