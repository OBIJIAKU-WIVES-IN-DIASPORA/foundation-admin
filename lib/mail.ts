import "server-only";
import { optionalEnv } from "./env";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function send(to: string, subject: string, html: string, text: string) {
  const key = optionalEnv("RESEND_API_KEY"), from = optionalEnv("MAIL_FROM");
  if (!key || !from) throw new Error("Email is not configured (RESEND_API_KEY / MAIL_FROM).");
  const res = await fetch(optionalEnv("RESEND_API_URL") ?? "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

const wrap = (inner: string) => `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#17261c">${inner}<p style="font-size:12px;color:#6b756e;margin-top:32px">If you did not expect this email, you can ignore it. Never share this message with anyone.</p></div>`;

export const sendLoginCode = (to: string, code: string) =>
  send(to, "Your admin sign-in code", wrap(`<h2 style="margin:0 0 12px">Your sign-in code</h2><p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0">${esc(code)}</p><p>It expires in 10 minutes. We will never ask you for it by phone or chat.</p>`),
    `Your admin sign-in code is ${code}. It expires in 10 minutes. Never share it.`);

export const sendInvite = (to: string, name: string, link: string) =>
  send(to, "You have been invited to the foundation admin", wrap(`<h2 style="margin:0 0 12px">Welcome, ${esc(name)}</h2><p>You have been invited to manage the foundation's website. This link works once and expires in 24 hours.</p><p><a href="${esc(link)}" style="display:inline-block;background:#2f6b45;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Set up your account</a></p>`),
    `You have been invited to the foundation admin. Set up your account (link works once, expires in 24 hours): ${link}`);

export const sendSecurityAlert = (to: string, ip: string) =>
  send(to, "Someone is trying to sign in to your admin account", wrap(`<h2 style="margin:0 0 12px">Repeated failed sign-ins</h2><p>Someone keeps entering the wrong password for your account (from IP address ${esc(ip)}).</p><p>They cannot get in without your password and a code, so you don't need to do anything. We have paused sign-ins from unrecognised browsers for 15 minutes. Browsers you've used before are not affected.</p><p>If you think your password may be known to someone else, change it from your account page.</p>`),
    `Someone keeps entering the wrong password for your admin account (IP ${ip}). They cannot get in without your password and a code. Sign-ins from unrecognised browsers are paused for 15 minutes; browsers you've used before are not affected.`);
