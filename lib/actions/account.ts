"use server";

import { ObjectId } from "mongodb";
import { users } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { findTrustedDevice, forgetDevices, getSession, revokeUserSessions, trustThisDevice } from "@/lib/session";
import { backupCode, hmac, normaliseBackupCode } from "@/lib/crypto";
import { checkPassword, hashPassword, passwordProblem } from "@/lib/password";
import { consume } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { newTotpSetup, verifyTotp } from "@/lib/totp";
import { first, newPasswordSchema, type FormState } from "@/lib/validation";

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(fd.get("current") ?? "");
  const pw = newPasswordSchema.safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!pw.success) return { ok: false, message: first(pw.error) };
  if (!(await consume(`pw-change:${user.id}`, 5, 900))) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  const u = await (await users()).findOne({ _id: new ObjectId(user.id) });
  if (!u?.passwordHash || !(await checkPassword(u.passwordHash, current))) return { ok: false, message: "Your current password is incorrect." };
  const problem = await passwordProblem(pw.data.password, user.email);
  if (problem) return { ok: false, message: problem };
  await (await users()).updateOne({ _id: u._id }, { $set: { passwordHash: await hashPassword(pw.data.password), passwordChangedAt: new Date() } });
  await revokeUserSessions(u._id, (await getSession())?.sessionId);
  await forgetDevices(u._id); // a changed password invalidates every "known browser"
  await trustThisDevice(u._id, await findTrustedDevice(u._id));
  await audit("account.password_changed", { actor: user });
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}

// Authenticator app: setup is two steps so a mistyped scan can never lock someone out.
export async function startTotp(): Promise<FormState> {
  const user = await requireUser();
  if (user.totpEnabled) return { ok: false, message: "The authenticator app is already on." };
  const setup = await newTotpSetup(user.email);
  await (await users()).updateOne({ _id: new ObjectId(user.id) }, { $set: { totpPending: { secretEnc: setup.secretEnc, createdAt: new Date() } } });
  return { ok: true, message: "", data: { qr: setup.qr, secret: setup.secretBase32 } };
}

export async function confirmTotp(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!(await consume(`totp-confirm:${user.id}`, 8, 900))) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  const u = await (await users()).findOne({ _id: new ObjectId(user.id) });
  if (!u?.totpPending) return { ok: false, message: "Start the setup again." };
  const step = verifyTotp(u.totpPending.secretEnc, code, u.email);
  if (step === null) return { ok: false, message: "That code didn't match. Check your phone's clock and try the next code." };
  const codes = Array.from({ length: 10 }, backupCode);
  await (await users()).updateOne({ _id: u._id }, {
    $set: { totp: { secretEnc: u.totpPending.secretEnc, enabledAt: new Date(), lastStep: step, backupCodes: codes.map((c) => ({ hash: hmac("backup", c) })) } },
    $unset: { totpPending: "" },
  });
  await revokeUserSessions(u._id, (await getSession())?.sessionId);
  await audit("account.totp_enabled", { actor: user });
  return { ok: true, message: "Authenticator app is on. Save these backup codes now. They are shown only once.", data: { codes } };
}

export async function disableTotp(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const password = String(fd.get("password") ?? ""), code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!(await consume(`totp-disable:${user.id}`, 5, 900))) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  const u = await (await users()).findOne({ _id: new ObjectId(user.id) });
  if (!u?.totp || !u.passwordHash || !(await checkPassword(u.passwordHash, password))) return { ok: false, message: "Your password is incorrect." };
  let ok = false;
  if (/^\d{6}$/.test(code)) {
    const step = verifyTotp(u.totp.secretEnc, code, u.email);
    ok = step !== null && step > u.totp.lastStep;
  } else {
    const h = hmac("backup", normaliseBackupCode(code));
    ok = u.totp.backupCodes.some((b) => b.hash === h && !b.usedAt);
  }
  if (!ok) return { ok: false, message: "That code isn't right." };
  await (await users()).updateOne({ _id: u._id }, { $unset: { totp: "" } });
  await audit("account.totp_disabled", { actor: user });
  return { ok: true, message: "Authenticator app turned off. Sign-in codes will be emailed instead." };
}

export async function signOutOtherDevices(): Promise<FormState> {
  const user = await requireUser();
  await revokeUserSessions(user.id, (await getSession())?.sessionId);
  await audit("account.signed_out_others", { actor: user });
  return { ok: true, message: "All other devices have been signed out." };
}

export async function forgetTrustedDevices(): Promise<FormState> {
  const user = await requireUser();
  await forgetDevices(user.id);
  await audit("account.devices_forgotten", { actor: user });
  return { ok: true, message: "All browsers forgotten. Each will be recognised again after its next sign-in." };
}
