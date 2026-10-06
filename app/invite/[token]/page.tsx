import type { Metadata } from "next";
import { invites } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { AcceptInviteForm } from "@/components/forms";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Set your password", referrer: "no-referrer" };

export default async function Invite({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const valid = await (await invites()).findOne({ tokenHash: sha256(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="mb-8 text-center">{valid ? "Set your password" : "Link expired"}</h1>
      <Card>
        {valid ? <AcceptInviteForm token={token} /> : <p className="text-sm text-zinc-700">This link has expired or was already used. Ask the site owner to send you a new one.</p>}
      </Card>
    </main>
  );
}
