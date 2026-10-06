import "server-only";
import { ObjectId } from "mongodb";
import { users } from "./db";
import { checkPassword } from "./password";
import { consume } from "./rate-limit";
import { audit } from "./audit";
import type { SessionUser } from "./types";

/** Sensitive actions re-ask for the current password. Returns an error message or null. */
export async function reauth(user: SessionUser, password: string): Promise<string | null> {
  if (!(await consume(`reauth:${user.id}`, 8, 900))) return "Too many attempts. Please wait a few minutes.";
  const u = await (await users()).findOne({ _id: new ObjectId(user.id) });
  if (!u?.passwordHash || !(await checkPassword(u.passwordHash, password))) {
    await audit("reauth.failed", { actor: user });
    return "Your password is incorrect.";
  }
  return null;
}
