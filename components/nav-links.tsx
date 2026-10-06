"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: string[][] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map(([href, label]) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm ${active ? "bg-white/15 font-medium text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"}`}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
