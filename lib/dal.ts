import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSession } from "./session";
import { audit } from "./audit";
import type { Role, SessionUser } from "./types";

/** Every page, action and route handler that touches data starts here. The proxy is NOT a security boundary. */
export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s.user;
}

export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (role === "superAdmin" && user.role !== "superAdmin") {
    await audit("access.denied", { actor: user, target: "superAdmin-only" });
    notFound();
  }
  return user;
}
