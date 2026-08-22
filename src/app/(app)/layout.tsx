import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activitesARappeler } from "@/lib/activites";
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
  const [anneeActive, rappels] = await Promise.all([
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
    activitesARappeler(),
  ]);

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar role={session.role} badges={{ "/activites": rappels.length }} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Topbar
          nom={session.nom}
          prenom={session.prenom}
          role={session.role}
          anneeActive={anneeActive?.libelle ?? null}
        />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
