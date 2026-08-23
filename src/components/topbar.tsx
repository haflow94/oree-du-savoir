"use client";

import { Menu, Search, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { logoutAction } from "@/app/(app)/logout-action";

type TopbarProps = {
  nom: string;
  prenom: string;
  role: Role;
  /**
   * Href déjà filtrés selon les droits de la session (voir (app)/layout.tsx).
   * Uniquement des chaînes : NAV_ITEMS (avec ses icônes, non sérialisables)
   * reste importé ici côté client plutôt que transmis en prop depuis le
   * Server Component.
   */
  hrefsVisibles: string[];
  anneeActive: string | null;
};

export function Topbar({ nom, prenom, role, hrefsVisibles, anneeActive }: TopbarProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => hrefsVisibles.includes(item.href));
  const current =
    items.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
    ) ?? items[0];

  return (
    <header className="sticky top-0 z-10 flex flex-col border-b border-border bg-bg-elevated">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-3">
          {/* Menu mobile : disclosure HTML pur, pas de JS nécessaire */}
          <details className="md:hidden">
            <summary className="list-none cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-ink-muted">
              <Menu aria-hidden size={18} />
            </summary>
            <div className="absolute left-0 right-0 top-16 z-20 border-b border-border bg-bg-elevated p-3 shadow-elevated">
              <nav className="flex flex-col gap-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink hover:bg-pine-soft"
                    >
                      <Icon aria-hidden size={17} strokeWidth={1.75} />
                      {item.label}
                    </a>
                  );
                })}
              </nav>
            </div>
          </details>
          <h1 className="font-display text-lg font-semibold text-pine-strong md:text-xl">
            {current?.label ?? "Tableau de bord"}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <form action="/recherche" method="GET" className="hidden sm:block">
            <label className="relative block">
              <Search
                aria-hidden
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="search"
                name="q"
                placeholder="Rechercher…"
                className="w-40 rounded-md border border-border py-1.5 pl-8 pr-3 text-sm text-ink transition-all focus:w-56 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft"
              />
            </label>
          </form>
          {anneeActive && (
            <span className="hidden rounded-full bg-pine-soft px-3 py-1 text-xs font-medium text-pine-strong sm:inline-block">
              Année active : {anneeActive}
            </span>
          )}
          <div className="hidden text-right text-xs leading-tight sm:block">
            <div className="font-medium text-ink">
              {prenom} {nom}
            </div>
            <div className="text-ink-faint">{ROLE_LABELS[role]}</div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-bg-sunken"
            >
              <LogOut aria-hidden size={14} />
              Déconnexion
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
