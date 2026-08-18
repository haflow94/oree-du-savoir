"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { ROLE_LABELS, hasRole, type Role } from "@/lib/roles";
import { logoutAction } from "@/app/(app)/logout-action";

type TopbarProps = {
  nom: string;
  prenom: string;
  role: Role;
  anneeActive: string | null;
};

export function Topbar({ nom, prenom, role, anneeActive }: TopbarProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => !item.rolesAllowed || hasRole(role, item.rolesAllowed),
  );
  const current =
    items.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
    ) ?? items[0];

  return (
    <header className="sticky top-0 z-10 flex flex-col border-b border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-3">
          {/* Menu mobile : disclosure HTML pur, pas de JS nécessaire */}
          <details className="md:hidden">
            <summary className="list-none cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600">
              ☰
            </summary>
            <div className="absolute left-0 right-0 top-16 z-20 border-b border-slate-200 bg-white p-3 shadow-lg">
              <nav className="flex flex-col gap-1">
                {items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    <span aria-hidden className="mr-2">
                      {item.icon}
                    </span>
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </details>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">
            {current?.label ?? "Tableau de bord"}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <form action="/recherche" method="GET" className="hidden sm:block">
            <input
              type="search"
              name="q"
              placeholder="Rechercher…"
              className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:w-56 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-all"
            />
          </form>
          {anneeActive && (
            <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-block">
              Année active : {anneeActive}
            </span>
          )}
          <div className="hidden text-right text-xs leading-tight sm:block">
            <div className="font-medium text-slate-800">
              {prenom} {nom}
            </div>
            <div className="text-slate-500">{ROLE_LABELS[role]}</div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
