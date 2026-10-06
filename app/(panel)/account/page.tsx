import type { Metadata } from "next";
import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/dal";
import { getSession } from "@/lib/session";
import { devices, sessions, users } from "@/lib/db";
import { ChangePasswordForm, ForgetDevices, SignOutOthers, TotpPanel } from "@/components/forms";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "My account" };

export default async function Account() {
  const user = await requireUser();
  const current = (await getSession())?.sessionId;
  const u = await (await users()).findOne({ _id: new ObjectId(user.id) });
  const list = await (await sessions()).find({ userId: new ObjectId(user.id), expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).toArray();
  const known = await (await devices()).find({ userId: new ObjectId(user.id), expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }).toArray();
  return (
    <div className="space-y-6">
      <h1>My account</h1>
      <Card><h2>{user.name}</h2><p className="text-sm text-zinc-600">{user.email} · {user.role === "superAdmin" ? "Super admin" : "Admin"}{u?.lastLoginAt ? ` · last sign-in ${u.lastLoginAt.toLocaleString("en-GB")}` : ""}</p></Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><h2 className="mb-4">Change password</h2><ChangePasswordForm /></Card>
        <Card><h2 className="mb-4">Authenticator app</h2><TotpPanel enabled={user.totpEnabled} /></Card>
      </div>
      <Card>
        <h2 className="mb-3">Where you&apos;re signed in</h2>
        <ul className="divide-y divide-zinc-100 text-sm">
          {list.map((s) => (
            <li key={String(s._id)} className="py-3">
              <span className="font-medium">{String(s._id) === current ? "This device" : "Another device"}</span>
              <span className="text-zinc-500"> · {s.ua || "unknown browser"} · {s.ip} · active {s.lastSeenAt.toLocaleString("en-GB")}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4"><SignOutOthers /></div>
      </Card>
      <Card>
        <h2 className="mb-1">Known browsers</h2>
        <p className="mb-3 text-sm text-zinc-600">Browsers you have signed in from before. If someone keeps guessing your password, these are never locked out. They still need your password and a code every time.</p>
        <ul className="divide-y divide-zinc-100 text-sm">
          {known.map((d) => <li key={String(d._id)} className="py-2">{d.ua || "unknown browser"}<span className="text-zinc-500"> · last used {d.lastUsedAt.toLocaleDateString("en-GB")}</span></li>)}
          {known.length === 0 && <li className="py-2 text-zinc-500">None yet.</li>}
        </ul>
        <div className="mt-4"><ForgetDevices /></div>
      </Card>
    </div>
  );
}
