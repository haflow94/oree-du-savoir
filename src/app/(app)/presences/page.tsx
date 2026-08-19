import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { estAdministratif } from "@/lib/acces-presence";
import { JOUR_LABELS } from "@/lib/planning";
import { aujourdhuiUTC, STATUT_SEANCE_LABELS } from "@/lib/presences";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";
const CONTROL_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";

export default async function PresencesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const { date } = await searchParams;

  const jourAffiche = date
    ? new Date(`${date}T00:00:00.000Z`)
    : aujourdhuiUTC();
  const jourISO = jourAffiche.toISOString().slice(0, 10);

  const administratif = estAdministratif(session.role);
  const estEnseignant = session.role === Role.ENSEIGNANT;

  const seances = await prisma.seance.findMany({
    where: {
      date: jourAffiche,
      ...(estEnseignant
        ? { classe: { enseignants: { some: { utilisateurId: session.id } } } }
        : {}),
    },
    orderBy: { classe: { heureDebut: "asc" } },
    include: {
      classe: {
        include: {
          cours: true,
          _count: { select: { inscriptions: true } },
        },
      },
      _count: { select: { presences: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-pine-strong">Présences</h1>
          <p className="text-sm text-ink-muted">
            {estEnseignant
              ? "Vos séances du jour."
              : "Séances du jour, toutes classes."}
          </p>
        </div>
        {administratif && (
          <Link href="/presences/fermetures" className={buttonVariants({ variant: "secondary" })}>
            Vacances et fermetures
          </Link>
        )}
      </div>

      <form action="/presences" method="GET" className="flex items-end gap-2">
        <div>
          <label htmlFor="date" className={LABEL_XS_CLASSES}>
            Date
          </label>
          <input
            id="date"
            type="date"
            name="date"
            defaultValue={jourISO}
            className={CONTROL_CLASSES}
          />
        </div>
        <Button type="submit" variant="secondary">
          Afficher
        </Button>
      </form>

      <div className="space-y-3">
        {seances.map((s) => {
          const complet = s._count.presences === s.classe._count.inscriptions;
          const statutVariant =
            s.statut === "VALIDEE" ? "success" : s.statut === "ANNULEE" ? "neutral" : "warning";
          return (
            <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-medium text-ink">
                  {s.classe.cours.nom}
                  {s.classe.niveau && (
                    <span className="ml-2 text-sm font-normal text-ink-muted">
                      {s.classe.niveau}
                    </span>
                  )}
                </div>
                <div className="text-sm text-ink-muted">
                  {JOUR_LABELS[s.classe.jour]} {s.classe.heureDebut}–
                  {s.classe.heureFin}
                  {s.classe.salle && ` · ${s.classe.salle}`}
                  {` · ${s.classe._count.inscriptions} inscrit(s)`}
                </div>
                {s.statut === "ANNULEE" && s.motifAnnulation && (
                  <div className="mt-1 text-sm text-ochre">
                    Annulée : {s.motifAnnulation}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={statutVariant}>
                  {STATUT_SEANCE_LABELS[s.statut]}
                  {s.statut === "VALIDEE" && !complet && " (incomplète)"}
                </Badge>
                {s.statut !== "ANNULEE" && (
                  <Link href={`/presences/${s.id}`} className={buttonVariants({ variant: "primary" })}>
                    {s.statut === "VALIDEE" ? "Consulter" : "Faire l'appel"}
                  </Link>
                )}
              </div>
            </Card>
          );
        })}

        {seances.length === 0 && (
          <EmptyState
            message="Aucune séance ce jour-là."
            hint="Les séances sont générées depuis le planning de chaque classe (voir la fiche de la classe)."
          />
        )}
      </div>
    </div>
  );
}
