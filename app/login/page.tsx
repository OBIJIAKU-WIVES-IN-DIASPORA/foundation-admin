import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/forms";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };
const NOTES: Record<string, string> = {
  expired: "Your sign-in timed out. Please start again.",
  locked: "Too many wrong codes. Please sign in again.",
  ready: "Password saved. You can sign in now.",
};

export default async function Login({ searchParams }: PageProps<"/login">) {
  if (await getSession()) redirect("/dashboard");
  const e = (await searchParams).e;
  const note = typeof e === "string" ? NOTES[e] : undefined;
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="mb-1 text-center">Foundation admin</h1>
      <p className="mb-8 text-center text-sm text-zinc-600">Sign in to manage the website</p>
      <Card>
        {note && <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">{note}</p>}
        <LoginForm />
      </Card>
    </main>
  );
}
