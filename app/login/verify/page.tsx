import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { challenges, users } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { CHALLENGE_COOKIE } from "@/lib/session";
import { VerifyForm } from "@/components/forms";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Verify" };
const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1•••$2");

export default async function Verify() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  const ch = token ? await (await challenges()).findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }) : null;
  if (!ch) redirect("/login?e=expired");
  const user = await (await users()).findOne({ _id: ch.userId });
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="mb-1 text-center">Check your {ch.method === "email" ? "email" : "authenticator app"}</h1>
      <p className="mb-8 text-center text-sm text-zinc-600">
        {ch.method === "email" ? `We sent a 6-digit code to ${user ? mask(user.email) : "your email"}. It expires in 10 minutes.` : "Open your authenticator app and enter the current code."}
      </p>
      <Card><VerifyForm method={ch.method} /></Card>
    </main>
  );
}
