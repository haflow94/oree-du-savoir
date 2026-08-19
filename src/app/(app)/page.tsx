import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/roles";
import { formaterMontant } from "@/lib/paiements";
import { Card } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await requireSession();

  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { active: true } });

  const [nbEtudiants, nbClasses, dossiersAnnee, nbPreinscrits] = await Promise.all([
    prisma.etudiant.count({ where: { statutInscription: "VALIDE" } }),
    anneeActive
      ? prisma.classe.count({ where: { anneeScolaireId: anneeActive.id } })
      : Promise.resolve(0),
    anneeActive
      ? prisma.dossierAnnuel.findMany({
          where: { anneeScolaireId: anneeActive.id },
          select: {
            montantDu: true,
            echeances: { select: { paiements: { select: { montant: true } } } },
          },
        })
      : Promise.resolve([]),
    prisma.etudiant.count({ where: { statutInscription: "PREINSCRIT" } }),
  ]);

  const resteAEncaisser = dossiersAnnee.reduce((total, d) => {
    const du = Number.parseFloat(d.montantDu.toString());
    const encaisse = d.echeances
      .flatMap((e) => e.paiements)
      .reduce((t, p) => t + Number.parseFloat(p.montant.toString()), 0);
    return total + Math.max(0, du - encaisse);
  }, 0);

  const metrics = [
    { label: "Étudiants", icon: "👥", valeur: nbEtudiants, href: "/etudiants" },
    { label: "Classes", icon: "🏫", valeur: nbClasses, href: "/classes" },
    {
      label: "Reste à encaisser",
      icon: "💳",
      valeur: formaterMontant(resteAEncaisser),
      href: "/paiements",
    },
    { label: "Dossiers à traiter", icon: "📁", valeur: nbPreinscrits, href: "/inscriptions" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-pine-strong">
          Bonjour {session.prenom}
        </h1>
        <p className="text-sm text-ink-muted">
          Connecté en tant que {ROLE_LABELS[session.role]}
          {anneeActive ? ` · Année active : ${anneeActive.libelle}` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href}>
            <Card className="transition-colors hover:border-border-strong">
              <div className="text-sm text-ink-muted">
                <span className="mr-1.5">{m.icon}</span>
                {m.label}
              </div>
              <div className="mt-2 text-2xl font-bold text-ink">{m.valeur}</div>
            </Card>
          </Link>
        ))}
      </div>

      {!anneeActive && (
        <p className="text-sm text-ink-faint">
          Aucune année scolaire active : les classes et le reste à encaisser
          ne peuvent pas être calculés (voir Administration → Année scolaire).
        </p>
      )}
    </div>
  );
}
