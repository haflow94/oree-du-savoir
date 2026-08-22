"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import type { Role } from "@/lib/roles";
import { hasRole } from "@/lib/roles";

// Entrelacs géométrique discret (losanges imbriqués), en filigrane derrière
// le menu — clin d'œil à l'identité de l'école, jamais au-dessus du texte.
const MOTIF_ENTRELACS = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'><g fill='none' stroke='#dce8d3' stroke-width='1'><path d='M28 2 L54 28 L28 54 L2 28 Z'/><path d='M28 14 L42 28 L28 42 L14 28 Z'/></g></svg>",
)}`;

export function Sidebar({
  role,
  badges,
}: {
  role: Role;
  /** Compteur à afficher en pastille à côté d'un lien, par href (ex. rappels d'activités). */
  badges?: Partial<Record<string, number>>;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => !item.rolesAllowed || hasRole(role, item.rolesAllowed),
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-pine-strong px-3 py-5 text-sage-bg/80 md:flex">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56 opacity-[0.08]"
        style={{
          backgroundImage: `url("${MOTIF_ENTRELACS}")`,
          backgroundSize: "56px 56px",
        }}
      />
      <div className="mb-6 px-3 font-display text-2xl font-semibold tracking-tight text-on-accent">
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
              className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 font-display text-xl tracking-tight transition-colors ${
                active
                  ? "bg-ochre/25 font-semibold text-on-accent"
                  : "font-medium text-sage-bg/80 hover:bg-white/10 hover:text-on-accent"
              }`}
            >
              <Icon aria-hidden size={20} strokeWidth={1.75} />
              {item.label}
              {!!badges?.[item.href] && (
                <span className="ml-auto rounded-full bg-ochre px-1.5 py-0.5 text-[10px] font-semibold text-on-accent">
                  {badges[item.href]}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 flex justify-center border-t border-white/10 pt-4">
        <div className="rounded-xl bg-[#f8f6ee] px-3 py-2.5 shadow-sm">
          <Image
            src="/logo-loree-du-savoir.png"
            alt="Logo de l'association L'Orée du Savoir"
            width={480}
            height={633}
            className="h-auto w-28"
          />
        </div>
      </div>
    </aside>
  );
}
