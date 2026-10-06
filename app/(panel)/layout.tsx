import { NavLinks } from "@/components/nav-links";
import { requireUser } from "@/lib/dal";
import { logout } from "@/lib/actions/auth";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = [
    ["/dashboard", "Dashboard"], ["/donations", "Donations"], ["/account", "My account"],
    ...(user.role === "superAdmin" ? [["/users", "Users"], ["/audit", "Audit log"]] : []),
  ];
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
      <aside className="md:w-56 md:shrink-0">
        <div className="rounded-2xl bg-brand-950 p-5 text-white md:sticky md:top-6">
          <p className="font-medium leading-tight">Foundation admin</p>
          <p className="mt-1 text-xs text-brand-100">{user.name} · {user.role === "superAdmin" ? "Super admin" : "Admin"}</p>
          <nav aria-label="Admin" className="mt-5 flex flex-wrap gap-1 md:flex-col">
            <NavLinks items={nav} />
          </nav>
          <form action={logout} className="mt-5"><button className="w-full rounded-lg border border-white/30 px-3 py-2 text-sm hover:bg-white/10">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
