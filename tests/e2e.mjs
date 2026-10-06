// End-to-end security and flow tests. Starts a throwaway MongoDB, a fake email service and the built app.
// Run: npm run build && npm run test:e2e
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { chromium } from "playwright-core";
import * as OTPAuth from "otpauth";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 3101, MAILPORT = 4021, BASE = `http://localhost:${PORT}`;
const SUPER = { email: "owner@example.org", pw: "correct horse battery staple" };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? "PASS" : "FAIL", m); };

// --- fake Resend ---
const emails = [];
const mail = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { emails.push(JSON.parse(b)); res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"x"}'); }); }).listen(MAILPORT);
const lastMail = async (to, since) => { for (let i = 0; i < 50; i++) { const m = [...emails].reverse().find((e) => e.to[0] === to); if (m && emails.indexOf(m) >= since) return m; await new Promise((r) => setTimeout(r, 100)); } throw new Error("no email for " + to); };
const codeOf = (m) => m.text.match(/\b(\d{6})\b/)[1];

const mongo = await MongoMemoryServer.create();
const env = { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DB: "t", AUTH_SECRET: "x".repeat(16) + "y".repeat(40), RESEND_API_KEY: "re_test", RESEND_API_URL: `http://localhost:${MAILPORT}/emails`, MAIL_FROM: "A <a@x.org>", ADMIN_URL: BASE, HIBP_CHECK: "off" };
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: "pipe" });
let serverLog = ""; server.stdout.on("data", (d) => (serverLog += d)); server.stderr.on("data", (d) => (serverLog += d));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/login")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const client = await MongoClient.connect(mongo.getUri()); const db = client.db("t");
const sup = spawnSync("node", ["scripts/create-superadmin.mjs"], { env: { ...env, SUPERADMIN_EMAIL: SUPER.email, SUPERADMIN_NAME: "Owner", SUPERADMIN_PASSWORD: SUPER.pw }, encoding: "utf8" });
ok(/created/.test(sup.stdout), "superadmin created by script: " + sup.stdout.trim() + sup.stderr.slice(0, 200));

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const cspErrors = [];
const newPage = async () => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on("console", (m) => { if (/Content Security Policy|Refused to/.test(m.text())) cspErrors.push(m.text().slice(0, 160)); }); return { ctx, p }; };

async function signIn(p, email, pw, codeFn) {
  await p.goto(BASE + "/login"); await p.fill("#email", email); await p.fill("#password", pw);
  const before = emails.length;
  await p.getByRole("button", { name: "Continue" }).click();
  await p.waitForURL(/login\/verify/, { timeout: 8000 }).catch(() => {});
  if (!p.url().includes("/login/verify")) return false;
  const code = await codeFn(before); await p.fill("#code", code); await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForTimeout(1200); return p.url().includes("/dashboard");
}
const emailCode = (to) => async (before) => codeOf(await lastMail(to, before));

try {
  // ---- headers & anonymous access ----
  const r = await fetch(BASE + "/login");
  const csp = r.headers.get("content-security-policy") || "";
  ok(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp) && /frame-ancestors 'none'/.test(csp) && !/unsafe-inline/.test(csp.split("script-src")[1].split(";")[0]), "CSP with per-request nonce, no unsafe-inline scripts, frame-ancestors none");
  ok(r.headers.get("x-frame-options") === "DENY" && r.headers.get("x-content-type-options") === "nosniff" && /no-store/.test(r.headers.get("cache-control")) && !r.headers.get("x-powered-by") && /noindex/.test(r.headers.get("x-robots-tag")), "security headers, no-store, noindex, no x-powered-by");
  const n1 = (await (await fetch(BASE + "/login")).headers.get("content-security-policy")).match(/nonce-([^']+)/)[1];
  ok(n1 !== csp.match(/nonce-([^']+)/)[1], "nonce differs per request");
  for (const path of ["/dashboard", "/donations", "/donations/export", "/users", "/audit", "/account"]) {
    const x = await fetch(BASE + path, { redirect: "manual" });
    ok(x.status >= 300 && x.status < 400 && (x.headers.get("location") || "").includes("/login"), `anonymous ${path} -> redirect to /login`);
  }
  ok(/Disallow: \//.test(await (await fetch(BASE + "/robots.txt")).text()), "robots.txt disallows everything");

  // ---- login: generic errors, wrong password, unknown user ----
  let { ctx: c1, p } = await newPage();
  await p.goto(BASE + "/login"); await p.fill("#email", SUPER.email); await p.fill("#password", "wrong-password-123"); await p.getByRole("button", { name: "Continue" }).click();
  await p.waitForSelector('[data-form-status="error"]'); const m1 = await p.textContent('[data-form-status="error"]');
  await p.fill("#email", "nobody@example.org"); await p.getByRole("button", { name: "Continue" }).click(); await p.waitForTimeout(800);
  const m2 = await p.textContent('[data-form-status="error"]');
  ok(m1 === m2 && /Incorrect email or password/.test(m1), "wrong password and unknown email give the identical message");

  // ---- full login with emailed code ----
  let before = emails.length;
  await p.fill("#email", SUPER.email); await p.fill("#password", SUPER.pw); await p.getByRole("button", { name: "Continue" }).click();
  await p.waitForURL(/login\/verify/);
  const m = await lastMail(SUPER.email, before); const code = codeOf(m);
  ok(/sign-in code/i.test(m.subject), "sign-in code emailed");
  await p.fill("#code", code === "000000" ? "111111" : "000000"); await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForSelector('[data-form-status="error"]'); ok(/4 attempt/.test(await p.textContent('[data-form-status="error"]')), "wrong emailed code rejected, attempts counted");
  await p.fill("#code", code); await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL(/dashboard/);
  const cookies = await c1.cookies(); const sc = cookies.find((c) => /admin_session/.test(c.name));
  ok(sc && sc.httpOnly && sc.sameSite === "Strict" && sc.secure && sc.name.startsWith("__Host-"), "session cookie is __Host-, HttpOnly, Secure, SameSite=Strict");
  ok(!(await db.collection("adminSessions").findOne({ tokenHash: sc.value })), "raw session token is not stored in the database (only its hash)");
  ok(await p.getByRole("link", { name: "Users" }).isVisible() && await p.getByRole("link", { name: "Audit log" }).isVisible(), "superadmin sees Users and Audit log");

  // ---- same code can't be used again; 5 wrong codes lock the challenge ----
  const { ctx: c2, p: p2 } = await newPage();
  before = emails.length;
  await p2.goto(BASE + "/login"); await p2.fill("#email", SUPER.email); await p2.fill("#password", SUPER.pw); await p2.getByRole("button", { name: "Continue" }).click(); await p2.waitForURL(/login\/verify/);
  await p2.fill("#code", code); await p2.getByRole("button", { name: "Sign in" }).click(); await p2.waitForSelector('[data-form-status="error"]');
  ok(/isn't right/.test(await p2.textContent('[data-form-status="error"]')), "a used code can't be replayed");
  for (let i = 0; i < 4; i++) { await p2.fill("#code", "123456"); await p2.getByRole("button", { name: "Sign in" }).click(); await p2.waitForTimeout(500); }
  await p2.waitForURL(/e=locked/, { timeout: 5000 }).catch(() => {});
  ok(p2.url().includes("e=locked"), "5 wrong codes end the sign-in attempt");
  const stillValid = await lastMail(SUPER.email, before); await p2.goto(BASE + "/login/verify"); ok(p2.url().includes("/login"), "challenge cookie is dead after lockout (cannot revisit verify)");
  await c2.close();

  // ---- seed donations ----
  await db.collection("donations").insertMany([
    { txRef: "T1", receiptNo: "OBJ-2026-000001", status: "successful", amountMinor: 2500000, currency: "NGN", cause: "education", causeLabel: "Education", donor: { name: "Chidi Eze", email: "chidi@x.com" }, country: "NG", createdAt: new Date(), paidAt: new Date("2026-09-10T10:00:00Z"), emailSentAt: new Date() },
    { txRef: "T2", receiptNo: "OBJ-2026-000002", status: "successful", amountMinor: 5000, currency: "GBP", cause: "health", causeLabel: "Healthcare", donor: { name: '=HYPERLINK("http://evil","x")', email: "ada@x.com" }, country: "GB", createdAt: new Date(), paidAt: new Date("2026-10-04T10:00:00Z"), emailSentAt: new Date() },
    { txRef: "T3", status: "flagged", amountMinor: 100, currency: "USD", cause: "all", causeLabel: "Where needed most", donor: { name: "Short Payer", email: "s@x.com" }, country: "US", createdAt: new Date() },
    { txRef: "T4", receiptNo: "OBJ-2026-000004", status: "successful", amountMinor: 1000, currency: "USD", cause: "all", causeLabel: "Where needed most", donor: { name: "<img src=x onerror=window.__xss=1>", email: "x@x.com" }, country: "US", createdAt: new Date(), paidAt: new Date("2026-10-05T10:00:00Z"), emailSentAt: new Date() },
  ]);
  await p.goto(BASE + "/dashboard"); const dash = await p.textContent("main");
  ok(/flagged/.test(dash) && /Unique donors/.test(dash), "dashboard shows totals and flags problem payments");
  await p.goto(BASE + "/donations?country=GB"); const tbl = await p.textContent("table");
  ok(/HYPERLINK/.test(tbl) && !/Chidi/.test(tbl), "country filter works");
  await p.goto(BASE + "/donations"); ok(!/Short Payer/.test(await p.textContent("table")), "default list shows successful donations only");
  await p.goto(BASE + "/donations?status=flagged"); ok(/Short Payer/.test(await p.textContent("table")), "status filter can show flagged payments");
  await p.goto(BASE + "/donations?from=2026-10-01&to=2026-10-04"); const dr = await p.textContent("table"); ok(/HYPERLINK/.test(dr) && !/Chidi/.test(dr), "date range filter is inclusive of the end day");
  await p.goto(BASE + "/donations?q=%7B%22%24ne%22%3Anull%7D"); ok(/No donations match/.test(await p.textContent("table")), "operator-looking search text is treated as plain text");
  await p.goto(BASE + "/donations"); ok((await p.evaluate(() => window.__xss)) === undefined && (await p.locator("table img").count()) === 0, "donor-supplied HTML is escaped (no XSS)");
  const bytes = await p.evaluate(async () => Array.from(new Uint8Array(await (await fetch("/donations/export")).arrayBuffer()).slice(0, 3)));
  const csv = await p.evaluate(async () => (await fetch("/donations/export")).text());
  ok(bytes.join() === "239,187,191" && /"'=HYPERLINK/.test(csv) && !/,"=HYPERLINK/.test(csv), "CSV export has BOM and neutralises spreadsheet formulas");

  // ---- invite flow, role boundaries ----
  const ADMIN = { email: "volunteer-admin@example.org", pw: "another long safe passphrase" };
  await p.goto(BASE + "/users"); before = emails.length;
  await p.fill("input[name=name]", "Client Admin"); await p.fill("input[name=email]", ADMIN.email); await p.fill("input[name=password]", "wrong"); await p.getByRole("button", { name: "Send invitation" }).click();
  await p.waitForSelector('[data-form-status="error"]'); ok(/password is incorrect/i.test(await p.textContent('[data-form-status="error"]')) && (await p.inputValue("input[name=email]")) === ADMIN.email, "inviting requires re-entering your password, and the form keeps what you typed");
  await p.fill("input[name=password]", SUPER.pw); await p.getByRole("button", { name: "Send invitation" }).click(); await p.waitForSelector('[data-form-status="ok"]');
  const inv = await lastMail(ADMIN.email, before); const link = inv.text.match(/https?:\/\/\S+\/invite\/\S+/)[0];
  ok(link.startsWith(BASE + "/invite/"), "invitation email contains a one-time link");
  const stored = await db.collection("adminInvites").findOne({}); ok(!link.includes(stored.tokenHash) && stored.tokenHash.length === 64, "invite token is stored hashed");

  const { ctx: c3, p: pa } = await newPage();
  await pa.goto(link); await pa.fill("#password", "short"); await pa.fill("#confirm", "short"); await pa.getByRole("button", { name: "Set password" }).click(); await pa.waitForSelector('[data-form-status="error"]');
  ok(/at least 12/.test(await pa.textContent('[data-form-status="error"]')), "weak password rejected");
  await pa.fill("#password", ADMIN.pw); await pa.fill("#confirm", ADMIN.pw); await pa.getByRole("button", { name: "Set password" }).click(); await pa.waitForURL(/e=ready/);
  await pa.goto(link); ok(/expired or was already used/.test(await pa.textContent("main")), "invite link works only once");
  ok(await signIn(pa, ADMIN.email, ADMIN.pw, emailCode(ADMIN.email)), "invited admin can sign in with emailed code");
  ok(!(await pa.getByRole("link", { name: "Users" }).isVisible().catch(() => false)), "admin does not see Users in the menu");
  for (const path of ["/users", "/audit"]) { const res = await pa.goto(BASE + path); ok(res.status() === 404, `admin requesting ${path} gets 404 (server-side role check)`); }
  ok(await db.collection("auditLogs").countDocuments({ action: "access.denied" }) >= 2, "denied access attempts are written to the audit log");

  // ---- authenticator app ----
  await pa.goto(BASE + "/account"); await pa.getByRole("button", { name: "Set up authenticator app" }).click();
  await pa.waitForSelector("img[alt^='QR code']"); const secret = (await pa.locator("span.font-mono").first().textContent()).trim();
  const totp = new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
  await pa.fill("#code", "000000"); await pa.getByRole("button", { name: "Turn on" }).click(); await pa.waitForSelector('[data-form-status="error"]');
  ok(/didn't match/.test(await pa.textContent('[data-form-status="error"]')), "wrong authenticator code does not enable it");
  await pa.fill("#code", totp.generate()); await pa.getByRole("button", { name: "Turn on" }).click(); await pa.waitForSelector("ul.font-mono, ul li.font-mono, ul.grid");
  const backups = await pa.locator("ul.grid li").allTextContents(); ok(backups.length === 10 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(backups[0]), "10 backup codes shown once");
  const dbu = await db.collection("adminUsers").findOne({ email: ADMIN.email });
  ok(!JSON.stringify(dbu).includes(secret) && !JSON.stringify(dbu).includes(backups[0]), "authenticator secret is encrypted and backup codes are hashed at rest");
  await pa.getByRole("button", { name: "Sign out", exact: true }).click(); await pa.waitForURL(/\/login/);
  const login2 = async (page, codeVal) => { await page.goto(BASE + "/login"); await page.fill("#email", ADMIN.email); await page.fill("#password", ADMIN.pw); await page.getByRole("button", { name: "Continue" }).click(); await page.waitForURL(/verify/); await page.fill("#code", codeVal); await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForTimeout(1200); return page.url().includes("/dashboard"); };
  ok(!/Send a new code/.test(await (async () => { await pa.goto(BASE + "/login"); await pa.fill("#email", ADMIN.email); await pa.fill("#password", ADMIN.pw); await pa.getByRole("button", { name: "Continue" }).click(); await pa.waitForURL(/verify/); return pa.textContent("main"); })()) , "with authenticator on, no email code is sent");
  await pa.goto(BASE + "/login/verify");
  const t1 = totp.generate({ timestamp: Date.now() + 30_000 }); // next step is accepted (±1 window)
  await pa.fill("#code", t1); await pa.getByRole("button", { name: "Sign in" }).click(); await pa.waitForTimeout(1200);
  ok(pa.url().includes("/dashboard"), "authenticator code signs in");
  await pa.getByRole("button", { name: "Sign out", exact: true }).click(); await pa.waitForURL(/\/login/);
  ok(!(await login2(pa, t1)), "the same authenticator code can't be used twice (replay protection)");
  await pa.goto(BASE + "/login"); 
  ok(await login2(pa, backups[0]), "a backup code signs in"); await pa.getByRole("button", { name: "Sign out", exact: true }).click(); await pa.waitForURL(/\/login/);
  ok(!(await login2(pa, backups[0])), "a backup code works only once");

  // ---- sessions: idle timeout, revocation, disable ----
  await db.collection("adminSessions").updateMany({ userId: (await db.collection("adminUsers").findOne({ email: SUPER.email }))._id }, { $set: { lastSeenAt: new Date(Date.now() - 31 * 60_000) } });
  await p.goto(BASE + "/dashboard"); ok(p.url().includes("/login"), "session idle for 31 minutes is rejected");
  ok(await signIn(p, SUPER.email, SUPER.pw, emailCode(SUPER.email)), "superadmin signs in again");
  const { ctx: c4, p: pb } = await newPage();
  ok(await signIn(pb, ADMIN.email, ADMIN.pw, async () => backups[1]), "admin signs in on a second device (backup code)");
  await p.goto(BASE + "/users"); await p.locator("summary").first().click();
  await p.locator("form:has(input[name=userId]) input[name=password]").fill(SUPER.pw); await p.getByRole("button", { name: "Disable account" }).click(); await p.waitForSelector('[data-form-status="ok"]');
  await pb.goto(BASE + "/dashboard"); ok(pb.url().includes("/login"), "disabling a user signs them out immediately");
  await pb.goto(BASE + "/login"); await pb.fill("#email", ADMIN.email); await pb.fill("#password", ADMIN.pw); await pb.getByRole("button", { name: "Continue" }).click();
  await pb.waitForSelector('[data-form-status="error"]'); ok(/Incorrect email or password/.test(await pb.textContent('[data-form-status="error"]')) && !pb.url().includes("verify"), "disabled user cannot sign in (same generic message)");
  ok(await db.collection("auditLogs").countDocuments({ action: "user.disable" }) === 1, "disable event is in the audit log");
  await p.goto(BASE + "/audit"); const aud = await p.textContent("table");
  ok(/login.success/.test(aud) && /login.failed/.test(aud) && !/correct horse|123456/.test(aud), "audit log lists events and holds no secrets");

  // ---- brute force on the password step ----
  const { ctx: c5, p: pc } = await newPage();
  let blocked = false;
  for (let i = 0; i < 7; i++) { await pc.goto(BASE + "/login"); await pc.fill("#email", "target@example.org"); await pc.fill("#password", "guess-number-" + i); await pc.getByRole("button", { name: "Continue" }).click(); await pc.waitForSelector('[data-form-status="error"]'); if (/Too many attempts/.test(await pc.textContent('[data-form-status="error"]'))) blocked = true; }
  ok(blocked, "repeated wrong passwords trigger a lockout");
  // ---- lockout can't be used to keep the real owner out ----
  const rl = db.collection("adminRateLimits");
  const superUser = await db.collection("adminUsers").findOne({ email: SUPER.email });
  const devs = await db.collection("adminDevices").find({ userId: superUser._id }).toArray();
  ok(devs.length >= 1 && devs.every((d) => d.tokenHash.length === 64), "a browser that completed sign-in is remembered (token stored hashed)");
  const { ctx: c6, p: atk } = await newPage();                       // attacker: knows the email, has no device cookie
  before = emails.length;
  for (let i = 0; i < 6; i++) { await atk.goto(BASE + "/login"); await atk.fill("#email", SUPER.email); await atk.fill("#password", "attacker-guess-" + i); await atk.getByRole("button", { name: "Continue" }).click(); await atk.waitForSelector('[data-form-status="error"]'); await atk.waitForTimeout(250); }
  ok(/Too many attempts/.test(await atk.textContent('[data-form-status="error"]')), "attacker is locked out after repeated guesses");
  const alert = await lastMail(SUPER.email, before).catch(() => null);
  ok(alert && /trying to sign in/i.test(alert.subject) && !/guess/.test(alert.text), "the real owner gets a security email (without any secrets)");
  await rl.deleteMany({}); await rl.insertOne({ _id: `login-acct:${SUPER.email}`, count: 99, resetAt: new Date(Date.now() + 600_000) });   // simulate a distributed attack on the account
  await atk.goto(BASE + "/login"); await atk.fill("#email", SUPER.email); await atk.fill("#password", SUPER.pw); await atk.getByRole("button", { name: "Continue" }).click(); await atk.waitForSelector('[data-form-status="error"]');
  ok(/Too many attempts/.test(await atk.textContent('[data-form-status="error"]')) && !atk.url().includes("verify"), "even the right password is refused from an unrecognised browser during an attack");
  await p.getByRole("button", { name: "Sign out", exact: true }).click(); await p.waitForURL(/\/login/);
  ok(await signIn(p, SUPER.email, SUPER.pw, emailCode(SUPER.email)), "the owner's usual browser still signs in during the same attack (password + code still required)");
  await p.getByRole("button", { name: "Sign out", exact: true }).click(); await p.waitForURL(/\/login/);
  let tBlocked = false;
  for (let i = 0; i < 12 && !tBlocked; i++) { await p.goto(BASE + "/login"); await p.fill("#email", SUPER.email); await p.fill("#password", "wrong-from-known-browser-" + i); await p.getByRole("button", { name: "Continue" }).click(); await p.waitForSelector('[data-form-status="error"]'); await p.waitForTimeout(200); tBlocked = /Too many/.test(await p.textContent('[data-form-status="error"]')); }
  ok(tBlocked, "a known browser is still limited by its own failure count (a stolen cookie can't brute-force the password)");
  await rl.deleteMany({});
  ok(await signIn(p, SUPER.email, SUPER.pw, emailCode(SUPER.email)), "known browser works again once its limit expires");
  await p.goto(BASE + "/account"); const oldId = String((await db.collection("adminDevices").findOne({ userId: superUser._id }))._id);
  const NEWPW = "a brand new long passphrase 42";
  await p.fill("#current", SUPER.pw); await p.fill("input[name=password]", NEWPW); await p.fill("input[name=confirm]", NEWPW); await p.getByRole("button", { name: "Change password" }).click(); await p.waitForSelector('[data-form-status="ok"]');
  const after = await db.collection("adminDevices").find({ userId: superUser._id }).toArray();
  ok(after.length === 1 && String(after[0]._id) !== oldId, "changing the password forgets every known browser");
  await c6.close();
  ok(cspErrors.length === 0, "no Content-Security-Policy violations in the browser: " + cspErrors.join(" | "));
  await Promise.all([c1, c3, c4, c5].map((c) => c.close()));
} catch (e) { fail++; console.log("FAIL (exception)", e.message.split("\n").slice(0, 8).join("\n")); console.log(serverLog.split("\n").slice(-15).join("\n")); }
finally { await browser.close(); server.kill(); mail.close(); await client.close(); await mongo.stop(); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
