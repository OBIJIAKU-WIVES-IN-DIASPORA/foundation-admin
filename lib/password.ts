import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { createHash } from "node:crypto";
import { optionalEnv } from "./env";

// Argon2id, OWASP-recommended parameters (46 MiB, 1 pass). algorithm 2 = Argon2id.
const OPTS = { memoryCost: 47104, timeCost: 1, parallelism: 1, algorithm: 2 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTS);
export const checkPassword = (stored: string, pw: string) => verify(stored, pw).catch(() => false);

// Verified against when the account doesn't exist, so response time doesn't reveal valid emails.
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(pw: string) {
  dummy ??= hash("not-a-real-password-for-timing", OPTS);
  await verify(await dummy, pw).catch(() => false);
}

const COMMON = new Set(["password1234", "123456789012", "qwertyuiop12", "administrator", "welcome12345", "letmein12345", "iloveyou1234"]);

// Returns an error message, or null if the password is acceptable.
export async function passwordProblem(pw: string, email: string): Promise<string | null> {
  if (pw.length < 12) return "Use at least 12 characters. A few random words make a strong password.";
  if (pw.length > 128) return "Password is too long (max 128 characters).";
  const lower = pw.toLowerCase();
  const local = email.split("@")[0]?.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(pw) || (local && local.length >= 4 && lower.includes(local)))
    return "That password is too easy to guess. Choose something less predictable.";
  if (optionalEnv("HIBP_CHECK") !== "off") {
    // k-anonymity: only the first 5 characters of the SHA-1 hash leave the server.
    try {
      const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
      const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const hit = (await res.text()).split("\n").find((l) => l.startsWith(sha1.slice(5)));
        if (hit && Number(hit.split(":")[1]) > 0) return "That password has appeared in a known data breach. Choose a different one.";
      }
    } catch {
      console.warn("[auth] breached-password check unavailable; continuing");
    }
  }
  return null;
}
