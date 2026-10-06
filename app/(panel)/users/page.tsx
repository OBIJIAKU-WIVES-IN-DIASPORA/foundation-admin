import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { users } from "@/lib/db";
import { InviteAdminForm, UserActions } from "@/components/forms";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Users" };

export default async function Users() {
  await requireRole("superAdmin");
  const list = await (await users()).find({}).sort({ createdAt: 1 }).toArray();
  return (
    <div className="space-y-6">
      <h1>Users</h1>
      <Card><h2 className="mb-4">Invite an admin</h2><InviteAdminForm /></Card>
      <Card>
        <h2 className="mb-3">Accounts</h2>
        <ul className="divide-y divide-zinc-100">
          {list.map((u) => (
            <li key={String(u._id)} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-medium">{u.name} <span className="text-sm font-normal text-zinc-500">· {u.role === "superAdmin" ? "Super admin" : "Admin"}</span></p><p className="text-sm text-zinc-600">{u.email}</p></div>
                <div className="text-right text-xs text-zinc-500">
                  <p className="text-sm font-medium text-brand-900">{u.status}</p>
                  <p>{u.totp ? "Authenticator app on" : "Email codes"}</p>
                  <p>{u.lastLoginAt ? `Last sign-in ${u.lastLoginAt.toLocaleDateString("en-GB")}` : "Never signed in"}</p>
                </div>
              </div>
              {u.role === "admin" && <UserActions userId={String(u._id)} status={u.status} hasTotp={!!u.totp} />}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
