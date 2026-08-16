import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const anneeActive = await prisma.anneeScolaire.findFirst({
    where: { active: true },
  });

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar role={session.role} />
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
