"use client";
import { useActionState, useState, useTransition } from "react";
import { acceptInvite, login, resendCode, verifyCode } from "@/lib/actions/auth";
import { changePassword, confirmTotp, disableTotp, forgetTrustedDevices, signOutOtherDevices, startTotp } from "@/lib/actions/account";
import { inviteAdmin, userAction } from "@/lib/actions/users";
import type { FormState } from "@/lib/validation";
import { btn, btnDanger, btnGhost, Field, input, Status } from "./ui";

const init: FormState = { ok: false, message: "" };

export function LoginForm() {
  const [s, a, p] = useActionState(login, init);
  return (
    <form action={a} className="space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="username" defaultValue={s.values?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" />
      <Status state={s} />
      <button className={`${btn} w-full`} disabled={p}>{p ? "Checking…" : "Continue"}</button>
    </form>
  );
}

export function VerifyForm({ method }: { method: "email" | "totp" }) {
  const [s, a, p] = useActionState(verifyCode, init);
  const [r, resend, rp] = useActionState(async () => resendCode(), init);
  return (
    <div className="space-y-4">
      <form action={a} className="space-y-4">
        <div>
          <label htmlFor="code" className="text-sm font-medium text-brand-950">{method === "email" ? "6-digit code from your email" : "Code from your authenticator app"}</label>
          <input id="code" name="code" required autoComplete="one-time-code" inputMode={method === "email" ? "numeric" : "text"} maxLength={12} autoFocus className={`${input} text-center text-xl tracking-[0.4em]`} />
          {method === "totp" && <p className="mt-1 text-xs text-zinc-500">Lost your phone? Enter one of your backup codes instead.</p>}
        </div>
        <Status state={s} />
        <button className={`${btn} w-full`} disabled={p}>{p ? "Verifying…" : "Sign in"}</button>
      </form>
      {method === "email" && (
        <form action={resend} className="text-center">
          <button className="text-sm text-brand-700 underline" disabled={rp}>Send a new code</button>
          <div className="mt-2"><Status state={r} /></div>
        </form>
      )}
    </div>
  );
}

export function AcceptInviteForm({ token }: { token: string }) {
  const [s, a, p] = useActionState(acceptInvite, init);
  return (
    <form action={a} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Choose a password" name="password" type="password" autoComplete="new-password" hint="At least 12 characters. A few random words work well." />
      <Field label="Repeat password" name="confirm" type="password" autoComplete="new-password" />
      <Status state={s} />
      <button className={`${btn} w-full`} disabled={p}>{p ? "Saving…" : "Set password"}</button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [s, a, p] = useActionState(changePassword, init);
  return (
    <form action={a} className="space-y-4">
      <Field label="Current password" name="current" type="password" autoComplete="current-password" />
      <Field label="New password" name="password" type="password" autoComplete="new-password" />
      <Field label="Repeat new password" name="confirm" type="password" autoComplete="new-password" />
      <Status state={s} />
      <button className={btn} disabled={p}>Change password</button>
    </form>
  );
}

export function TotpPanel({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [c, confirmAction, cp] = useActionState(confirmTotp, init);
  const [d, disableAction, dp] = useActionState(disableTotp, init);
  const codes = c.ok ? (c.data?.codes as string[] | undefined) : undefined;

  if (codes) {
    return (
      <div className="space-y-3">
        <Status state={c} />
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-brand-50 p-4 font-mono text-sm">{codes.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="text-xs text-zinc-600">Each code works once if you lose your phone. Store them somewhere safe, such as a password manager.</p>
      </div>
    );
  }
  if (enabled) {
    return (
      <form action={disableAction} className="space-y-3">
        <p className="text-sm text-zinc-700">An authenticator app is protecting this account. To turn it off, confirm your password and a current code.</p>
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <Field label="Authenticator or backup code" name="code" />
        <Status state={d} />
        <button className={btnDanger} disabled={dp}>Turn off authenticator app</button>
      </form>
    );
  }
  if (!setup) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-700">Right now, sign-in codes are sent to your email. For stronger protection, use an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).</p>
        {err && <Status state={{ ok: false, message: err }} />}
        <button className={btn} disabled={pending} onClick={() => start(async () => { const r = await startTotp(); if (r.ok && r.data) setSetup({ qr: String(r.data.qr), secret: String(r.data.secret) }); else setErr(r.message); })}>Set up authenticator app</button>
      </div>
    );
  }
  return (
    <form action={confirmAction} className="space-y-3">
      <p className="text-sm text-zinc-700">1. Scan this QR code with your authenticator app. 2. Enter the 6-digit code it shows.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR code to add this account to your authenticator app" width={220} height={220} className="rounded-lg border border-zinc-200" />
      <p className="text-xs text-zinc-500">Can&apos;t scan? Enter this key manually: <span className="font-mono">{setup.secret}</span></p>
      <Field label="6-digit code" name="code" autoComplete="one-time-code" />
      <Status state={c} />
      <button className={btn} disabled={cp}>Turn on</button>
    </form>
  );
}

export function SignOutOthers() {
  const [s, a, p] = useActionState(async () => signOutOtherDevices(), init);
  return (
    <form action={a} className="space-y-2">
      <button className={btnGhost} disabled={p}>Sign out all other devices</button>
      <Status state={s} />
    </form>
  );
}

export function InviteAdminForm() {
  const [s, a, p] = useActionState(inviteAdmin, init);
  return (
    <form action={a} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" autoComplete="off" defaultValue={s.values?.name} />
        <Field label="Email" name="email" type="email" autoComplete="off" defaultValue={s.values?.email} />
      </div>
      <Field label="Your password (to confirm)" name="password" type="password" autoComplete="current-password" />
      <Status state={s} />
      <button className={btn} disabled={p}>Send invitation</button>
    </form>
  );
}

export function UserActions({ userId, status, hasTotp }: { userId: string; status: string; hasTotp: boolean }) {
  const [s, a, p] = useActionState(userAction, init);
  const ops = [
    status === "disabled" ? ["enable", "Enable account"] : ["disable", "Disable account"],
    ["link", status === "invited" ? "Send invitation again" : "Send password-reset link"],
    ...(hasTotp ? [["reset2fa", "Reset authenticator app"]] : []),
    ["signout", "Sign out everywhere"],
  ];
  return (
    <details className="mt-3 rounded-lg border border-zinc-200 p-3">
      <summary className="text-sm font-medium text-brand-700">Manage</summary>
      <form action={a} className="mt-3 space-y-3">
        <input type="hidden" name="userId" value={userId} />
        <Field label="Your password (to confirm)" name="password" type="password" autoComplete="current-password" />
        <div className="flex flex-wrap gap-2">
          {ops.map(([op, label]) => <button key={op} name="op" value={op} className={op === "disable" ? btnDanger : btnGhost} disabled={p}>{label}</button>)}
        </div>
        <Status state={s} />
      </form>
    </details>
  );
}

export function ForgetDevices() {
  const [s, a, p] = useActionState(async () => forgetTrustedDevices(), init);
  return (
    <form action={a} className="space-y-2">
      <button className={btnGhost} disabled={p}>Forget all known browsers</button>
      <Status state={s} />
    </form>
  );
}
