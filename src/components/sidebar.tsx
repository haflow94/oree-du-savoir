"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import type { Role } from "@/lib/roles";
import { hasRole } from "@/lib/roles";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => !item.rolesAllowed || hasRole(role, item.rolesAllowed),
  );

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 px-3 py-5 text-slate-200 md:flex">
      <div className="mb-6 px-3 text-lg font-bold tracking-tight text-white">
        L&apos;Orée du Savoir
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-slate-700/60 font-medium text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
