"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { challenges, invites, users } from "@/lib/db";
import { hmac, newToken, normaliseBackupCode, safeEqual, sha256, sixDigitCode } from "@/lib/crypto";
import { burnPasswordCheck, checkPassword, hashPassword, passwordProblem } from "@/lib/password";
import { addFailure, clearLimit, consume, isBlocked } from "@/lib/rate-limit";
import { requestInfo } from "@/lib/request";
import { audit } from "@/lib/audit";
import { sendLoginCode, sendSecurityAlert } from "@/lib/mail";
import { after } from "next/server";
import { verifyTotp } from "@/lib/totp";
import { CHALLENGE_COOKIE, cookieOptions, createSession, destroyCurrentSession, findTrustedDevice, forgetDevices, getSession, revokeUserSessions, trustThisDevice } from "@/lib/session";
import { codeSchema, first, loginSchema, newPasswordSchema, type FormState } from "@/lib/validation";

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const GENERIC = "Incorrect email or password.";

async function issueEmailCode(challengeId: ObjectId, tokenHash: string, to: string) {
  const code = sixDigitCode();
  await sendLoginCode(to, code);
  await (await challenges()).updateOne(
    { _id: challengeId },
    { $set: { codeHash: hmac("otp", tokenHash + code), codeSentAt: new Date() }, $inc: { sends: 1 } },
  );
}

// Step 1: email + password. A correct password only earns a short-lived "pending" challenge, never access.
export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { ok: false, message: "Enter your email address and password." };
  const { email, password } = parsed.data;
  const { ip, ua } = await requestInfo();

  const user = await (await users()).findOne({ email });
  // A browser that has fully signed in to THIS account before is "trusted": it is only limited by its own
  // failure count, so an attacker hammering the account can't lock the real owner out of their usual browser.
  const device = user ? await findTrustedDevice(user._id) : null;
  if (device) {
    if (await isBlocked(`login-dev:${device._id}`, 10)) {
      await audit("login.blocked", { target: email, meta: { trusted: true } });
      return { ok: false, message: "Too many attempts. Please wait 15 minutes and try again.", values: { email } };
    }
  } else if (!(await consume(`login-ip:${ip}`, 40, 900)) || (await isBlocked(`login-acct-ip:${email}:${ip}`, 5)) || (await isBlocked(`login-acct:${email}`, 20))) {
    await audit("login.blocked", { target: email });
    return { ok: false, message: "Too many attempts. Please wait 15 minutes and try again.", values: { email } };
  }

  let valid = false;
  if (user && user.status === "active" && user.passwordHash) valid = await checkPassword(user.passwordHash, password);
  else await burnPasswordCheck(password);

  if (!valid || !user) {
    if (device) await addFailure(`login-dev:${device._id}`, 900);
    else {
      await Promise.all([addFailure(`login-acct-ip:${email}:${ip}`, 900), addFailure(`login-acct:${email}`, 900)]);
      // Tell the real owner (never the attacker), without delaying the response, so timing doesn't reveal valid emails.
      if (user && user.status === "active") {
        const target = user.email;
        after(async () => {
          if ((await isBlocked(`login-acct-ip:${email}:${ip}`, 5)) && (await consume(`sec-alert:${user._id}`, 1, 3600))) {
            await sendSecurityAlert(target, ip).catch((e) => console.error("[auth] security alert failed", e));
          }
        });
      }
    }
    await audit("login.failed", { target: email, meta: { trusted: !!device } });
    return { ok: false, message: GENERIC, values: { email } };
  }

  const col = await challenges();
  await col.deleteMany({ userId: user._id }); // one pending challenge per user
  const token = newToken(), tokenHash = sha256(token);
  const method = user.totp ? "totp" : "email";
  const { insertedId } = await col.insertOne({
    tokenHash, userId: user._id, method, sends: 0, attempts: 0, ip, trusted: !!device, expiresAt: new Date(Date.now() + CODE_TTL_MS),
  } as never);

  if (method === "email") {
    if (!(await consume(`otp-send:${user._id}`, 5, 900))) return { ok: false, message: "Too many codes requested. Please wait 15 minutes." };
    try {
      await issueEmailCode(insertedId, tokenHash, user.email);
    } catch (e) {
      console.error("[auth] could not send login code", e);
      await col.deleteOne({ _id: insertedId });
      return { ok: false, message: "We couldn't send your sign-in code. Please try again shortly." };
    }
  }
  (await cookies()).set(CHALLENGE_COOKIE, token, cookieOptions(CODE_TTL_MS));
  await audit("login.password_ok", { actor: { id: user._id, email: user.email }, meta: { method, ua: ua.slice(0, 60) } });
  redirect("/login/verify");
}

async function currentChallenge() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  return (await challenges()).findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
}

// Step 2: the emailed code, or the authenticator app code, or a one-time backup code.
export async function verifyCode(_: FormState, fd: FormData): Promise<FormState> {
  const ch = await currentChallenge();
  if (!ch) redirect("/login?e=expired");
  const parsed = codeSchema.safeParse({ code: fd.get("code") });
  if (!parsed.success) return { ok: false, message: "Enter the code." };
  const clean = parsed.data.code.replace(/\s/g, "");

  const user = await (await users()).findOne({ _id: ch.userId, status: "active" });
  if (!user) redirect("/login?e=expired");
  const cols = await challenges();

  let ok = false;
  if (ch.method === "email") {
    const fresh = ch.codeSentAt && Date.now() - ch.codeSentAt.getTime() < CODE_TTL_MS;
    ok = !!(fresh && ch.codeHash && /^\d{6}$/.test(clean) && safeEqual(ch.codeHash, hmac("otp", ch.tokenHash + clean)));
  } else if (user.totp) {
    if (/^\d{6}$/.test(clean)) {
      const step = verifyTotp(user.totp.secretEnc, clean, user.email);
      // the step must be newer than the last one used, so a captured code can't be replayed
      if (step !== null) ok = (await (await users()).updateOne({ _id: user._id, "totp.lastStep": { $lt: step } }, { $set: { "totp.lastStep": step } })).matchedCount === 1;
    } else {
      const h = hmac("backup", normaliseBackupCode(parsed.data.code));
      const used = await (await users()).updateOne(
        { _id: user._id, "totp.backupCodes": { $elemMatch: { hash: h, usedAt: { $exists: false } } } },
        { $set: { "totp.backupCodes.$.usedAt": new Date() } },
      );
      ok = used.matchedCount === 1;
      if (ok) await audit("login.backup_code_used", { actor: user });
    }
  }

  if (!ok) {
    const updated = await cols.findOneAndUpdate({ _id: ch._id }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
    if (!ch.trusted) await addFailure(`login-acct:${user.email}`, 900);
    await audit("login.2fa_failed", { actor: user });
    if (!updated || updated.attempts >= MAX_ATTEMPTS) {
      await cols.deleteOne({ _id: ch._id });
      (await cookies()).delete(CHALLENGE_COOKIE);
      redirect("/login?e=locked");
    }
    return { ok: false, message: `That code isn't right. ${MAX_ATTEMPTS - updated.attempts} attempt(s) left.` };
  }

  await cols.deleteOne({ _id: ch._id });
  const jar = await cookies();
  jar.delete(CHALLENGE_COOKIE);
  await destroyCurrentSession(); // never reuse a pre-login session id
  await createSession(user._id);
  await (await users()).updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await trustThisDevice(user._id, await findTrustedDevice(user._id));
  await clearLimit(`login-acct:${user.email}`);
  await audit("login.success", { actor: user });
  redirect("/dashboard");
}

export async function resendCode(): Promise<FormState> {
  const ch = await currentChallenge();
  if (!ch) redirect("/login?e=expired");
  if (ch.method !== "email") return { ok: false, message: "Use your authenticator app code." };
  if (ch.codeSentAt && Date.now() - ch.codeSentAt.getTime() < 60_000) return { ok: false, message: "Please wait a minute before asking for another code." };
  if (ch.sends >= 3 || !(await consume(`otp-send:${ch.userId}`, 5, 900))) return { ok: false, message: "No more codes can be sent for this sign-in. Start again." };
  const user = await (await users()).findOne({ _id: ch.userId, status: "active" });
  if (!user) redirect("/login?e=expired");
  try {
    await issueEmailCode(ch._id, ch.tokenHash, user.email);
  } catch (e) {
    console.error("[auth] resend failed", e);
    return { ok: false, message: "We couldn't send the code. Please try again shortly." };
  }
  return { ok: true, message: "A new code is on its way." };
}

export async function logout() {
  const jar = await cookies();
  const s = await getSession();
  await destroyCurrentSession();
  jar.delete(CHALLENGE_COOKIE);
  if (s) await audit("logout", { actor: s.user });
  redirect("/login");
}

// Invite and password-reset links both land here.
export async function acceptInvite(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") ?? "");
  const pw = newPasswordSchema.safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!pw.success) return { ok: false, message: first(pw.error) };
  const inv = await (await invites()).findOne({ tokenHash: sha256(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!inv) return { ok: false, message: "This link has expired or was already used. Ask the site owner for a new one." };
  const user = await (await users()).findOne({ _id: inv.userId, status: { $in: ["invited", "active"] } });
  if (!user) return { ok: false, message: "This link is no longer valid." };
  const problem = await passwordProblem(pw.data.password, user.email);
  if (problem) return { ok: false, message: problem };

  const claimed = await (await invites()).updateOne({ _id: inv._id, usedAt: { $exists: false } }, { $set: { usedAt: new Date() } });
  if (claimed.modifiedCount !== 1) return { ok: false, message: "This link was already used." };
  await (await users()).updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(pw.data.password), status: "active", passwordChangedAt: new Date() } });
  await revokeUserSessions(user._id);
  await forgetDevices(user._id);
  await audit("account.password_set_via_link", { actor: user });
  redirect("/login?e=ready");
}

