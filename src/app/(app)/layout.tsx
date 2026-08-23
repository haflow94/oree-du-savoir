import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activitesARappeler } from "@/lib/activites";
import { peutAccederModule } from "@/lib/permissions";
import { Role } from "@/lib/roles";
import { NAV_ITEMS } from "@/lib/nav";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Une session restreinte au QR (voir SessionUser dans src/lib/auth.ts) est
  // toujours redirigée par requireSession() vers /appel/{id} — une page hors
  // de ce layout, donc jamais de menu à cacher ici : si on arrive jusque-là,
  // c'est qu'on a le droit de voir l'appli normale.
  const session = await requireSession();
  const [anneeActive, rappels, visibilites] = await Promise.all([
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
    activitesARappeler(),
    Promise.all(
      NAV_ITEMS.map((item) =>
        !item.module ? true : peutAccederModule(session.role, item.module, "LECTURE"),
      ),
    ),
  ]);
  // Le tableau de bord (item sans module) agrège plusieurs modules, jamais
  // pertinent pour Enseignant qui n'a accès qu'à Présences (voir la
  // redirection dans (app)/page.tsx) — masqué ici pour cohérence du menu.
  const items = NAV_ITEMS.filter(
    (item, i) => visibilites[i] && !(item.href === "/" && session.role === Role.ENSEIGNANT),
  );

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar items={items} badges={{ "/activites": rappels.length }} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Topbar
          nom={session.nom}
          prenom={session.prenom}
          role={session.role}
          items={items}
          anneeActive={anneeActive?.libelle ?? null}
        />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
