// Creates the SuperAdmin, or resets their password / authenticator app. Runs on a trusted machine only.
//   npm run create-superadmin                 create (or reset the password of) the SuperAdmin
//   npm run create-superadmin -- --reset-2fa  also switch off their authenticator app (lost phone)
import readline from "node:readline";
import { MongoClient } from "mongodb";
import { hash } from "@node-rs/argon2";

const reset2fa = process.argv.includes("--reset-2fa");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = (q) => new Promise((r) => rl.question(q, r));
function askHidden(q) {
  return new Promise((resolve) => {
    const out = rl.output; const write = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(q)) write.call(rl, s); };
    rl.question(q, (a) => { rl._writeToOutput = write; out.write("\n"); resolve(a); });
  });
}

if (!process.env.MONGODB_URI) { console.error("MONGODB_URI is missing. Fill in .env.local first."); process.exit(1); }
// SUPERADMIN_* variables exist for automated tests only. For real use, type the password at the prompt
// so it never lands in shell history or the environment.
const auto = process.env.SUPERADMIN_PASSWORD;
const email = (auto ? process.env.SUPERADMIN_EMAIL : await ask("SuperAdmin email: ")).trim().toLowerCase();
const name = (auto ? process.env.SUPERADMIN_NAME : await ask("Display name: "))?.trim() || "Super Admin";
const pw = auto ?? (await askHidden("Password (min 12 characters): "));
const pw2 = auto ?? (await askHidden("Repeat password: "));
rl.close();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("That doesn't look like an email address."); process.exit(1); }
if (pw !== pw2) { console.error("Passwords don't match."); process.exit(1); }
if (pw.length < 12 || pw.length > 128) { console.error("Password must be 12 to 128 characters."); process.exit(1); }

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB || "obijiaku");
const users = db.collection("adminUsers");
await users.createIndex({ email: 1 }, { unique: true });
const passwordHash = await hash(pw, { memoryCost: 47104, timeCost: 1, parallelism: 1, algorithm: 2 });

const existing = await users.findOne({ role: "superAdmin" });
if (existing && existing.email !== email) { console.error(`A SuperAdmin already exists (${existing.email}). Use that email to reset it.`); process.exit(1); }
const now = new Date();
const update = { $set: { name, role: "superAdmin", status: "active", passwordHash, passwordChangedAt: now }, $setOnInsert: { email, createdAt: now } };
if (reset2fa) update.$unset = { totp: "", totpPending: "" };
await users.updateOne({ email }, update, { upsert: true });
const u = await users.findOne({ email });
await db.collection("adminSessions").deleteMany({ userId: u._id }); // sign out everywhere
await db.collection("auditLogs").insertOne({ at: now, action: existing ? "superadmin.reset_via_cli" : "superadmin.created_via_cli", actorEmail: email, ip: "cli", ua: "script" });
console.log(existing ? "SuperAdmin updated." : "SuperAdmin created.", reset2fa ? "Authenticator app switched off." : "");
await client.close();
