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
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-pine-strong px-3 py-5 text-sage-bg/80 md:flex">
      <div className="mb-6 px-3 font-display text-lg font-semibold tracking-tight text-on-accent">
        L&apos;Orée du Savoir
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-pine font-medium text-on-accent"
                  : "text-sage-bg/80 hover:bg-pine hover:text-on-accent"
              }`}
            >
              <Icon aria-hidden size={17} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
